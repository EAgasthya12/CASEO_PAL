const { google } = require('googleapis');
const { analyzeText } = require('./pythonBridge');
const Email = require('../models/Email');
const User = require('../models/User');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const fetchAndProcessEmails = async (user, count = 50) => {
    try {
        if (!user.accessToken) throw new Error('No access token found for user');

        oauth2Client.setCredentials({
            access_token: user.accessToken,
            refresh_token: user.refreshToken
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        console.log(`Fetching emails for user ${user.email}...`);

        // List messages (fetch all, not just unread, limit 50 for now)
        // Added labelIds: ['INBOX'] to focus on Inbox
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: count,
            labelIds: ['INBOX']
        });

        const messages = response.data.messages;
        if (!messages || messages.length === 0) {
            console.log('No new messages found.');
            return [];
        }

        // Optimization: bulk check existing emails
        const messageIds = messages.map(msg => msg.id);
        const existingEmails = await Email.find({ googleMessageId: { $in: messageIds } }).select('googleMessageId');
        const existingIds = new Set(existingEmails.map(e => e.googleMessageId));

        const newMessages = messages.filter(msg => !existingIds.has(msg.id));

        if (newMessages.length === 0) {
            console.log('All fetched messages are already processed.');
            return [];
        }

        console.log(`Found ${newMessages.length} new messages to process.`);

        const processedEmails = [];

        // Helper to process a single message
        const processMessage = async (msg) => {
            try {
                // Get content
                const detail = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'full'
                });

                const payload = detail.data.payload;
                const headers = payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                const from = headers.find(h => h.name === 'From')?.value || '(Unknown)';
                const dateHeader = headers.find(h => h.name === 'Date')?.value;
                const date = dateHeader ? new Date(dateHeader) : new Date();

                // Extract Body
                let body = '';
                if (payload.body.data) {
                    body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
                } else if (payload.parts) {
                    // Find HTML or Text part
                    // Handle nested parts slightly better (simple recursion or check sub-parts if needed, but keeping simple for now)
                    let part = payload.parts.find(p => p.mimeType === 'text/html') || payload.parts.find(p => p.mimeType === 'text/plain');

                    // Fallback for nested multipart/alternative
                    if (!part && payload.parts) {
                        for (const p of payload.parts) {
                            if (p.parts) {
                                part = p.parts.find(sub => sub.mimeType === 'text/html') || p.parts.find(sub => sub.mimeType === 'text/plain');
                                if (part) break;
                            }
                        }
                    }

                    if (part && part.body.data) {
                        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
                    }
                }

                // Use snippet for classification to save tokens/complexity, but store full body
                const snippet = detail.data.snippet || '';

                console.log(`Processing email: ${subject}`);

                // Call Intelligence Layer
                // We combine subject and snippet for better context
                const textToAnalyze = `${subject}\n${snippet}`;
                const intelligence = await analyzeText(textToAnalyze);

                const newEmail = new Email({
                    userId: user._id,
                    googleMessageId: msg.id,
                    subject,
                    sender: from,
                    date,
                    snippet,
                    body, // Save full body
                    category: intelligence.category || 'Unknown',
                    confidence: intelligence.confidence,
                    urgency: intelligence.urgency || 'Low',
                    extractedDeadlines: intelligence.deadlines || [],
                    isProcessed: true
                });

                await newEmail.save();
                return newEmail;
            } catch (err) {
                console.error(`Failed to process message ${msg.id}:`, err.message);
                return null;
            }
        };

        // Process in chunks to avoid rate limits
        const chunkSize = 10;
        for (let i = 0; i < newMessages.length; i += chunkSize) {
            const chunk = newMessages.slice(i, i + chunkSize);
            const results = await Promise.all(chunk.map(msg => processMessage(msg)));
            processedEmails.push(...results.filter(r => r !== null));

            // Add a small delay between chunks to keep the laptop safe
            if (i + chunkSize < newMessages.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log(`Processed ${processedEmails.length} new emails.`);
        return processedEmails;

    } catch (error) {
        console.error('Error in fetchAndProcessEmails:', error.message);
        throw error;
    }
};

/**
 * Fetch emails from a Gmail mailbox label (SENT, DRAFT, TRASH)
 * directly from Gmail API — no DB storage, no AI analysis.
 * @param {Object} user - Authenticated user with accessToken/refreshToken
 * @param {string} label - Gmail label: 'SENT', 'DRAFT', 'TRASH'
 * @param {number} count - Max results to fetch
 */
const fetchMailboxEmails = async (user, label = 'SENT', count = 30) => {
    try {
        if (!user.accessToken) throw new Error('No access token found for user');

        const client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        client.setCredentials({
            access_token: user.accessToken,
            refresh_token: user.refreshToken
        });

        const gmail = google.gmail({ version: 'v1', auth: client });

        console.log(`[GmailService] Fetching ${label} mailbox for user ${user.email}...`);

        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: count,
            labelIds: [label]
        });

        const messages = response.data.messages;
        if (!messages || messages.length === 0) {
            console.log(`[GmailService] No messages found in ${label}.`);
            return [];
        }

        // Fetch message details in parallel (no AI, just headers + snippet)
        const details = await Promise.all(
            messages.map(async (msg) => {
                try {
                    const detail = await gmail.users.messages.get({
                        userId: 'me',
                        id: msg.id,
                        format: 'metadata',
                        metadataHeaders: ['Subject', 'From', 'To', 'Date']
                    });

                    const headers = detail.data.payload?.headers || [];
                    const get = (name) => headers.find(h => h.name === name)?.value || '';

                    return {
                        _id: msg.id,
                        googleMessageId: msg.id,
                        subject: get('Subject') || '(No Subject)',
                        sender: get('From') || '(Unknown)',
                        recipient: get('To') || '',
                        date: get('Date') ? new Date(get('Date')) : new Date(),
                        snippet: detail.data.snippet || '',
                        mailbox: label,
                        // No urgency/category/deadlines — not analyzed
                    };
                } catch (err) {
                    console.error(`[GmailService] Failed to fetch message ${msg.id}:`, err.message);
                    return null;
                }
            })
        );

        const results = details.filter(d => d !== null);
        console.log(`[GmailService] Fetched ${results.length} messages from ${label}.`);
        return results;

    } catch (error) {
        console.error(`[GmailService] Error fetching mailbox ${label}:`, error.message);
        throw error;
    }
};


module.exports = { fetchAndProcessEmails, fetchMailboxEmails };
