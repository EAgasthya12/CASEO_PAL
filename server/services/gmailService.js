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
        const response = await gmail.users.messages.list({
            userId: 'me',
            maxResults: count,
        });

        const messages = response.data.messages;
        if (!messages || messages.length === 0) {
            console.log('No new messages found.');
            return [];
        }

        const processedEmails = [];

        for (const msg of messages) {
            // Check if already processed
            const existing = await Email.findOne({ googleMessageId: msg.id });
            if (existing) continue;

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
                const part = payload.parts.find(p => p.mimeType === 'text/html') || payload.parts.find(p => p.mimeType === 'text/plain');
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
            processedEmails.push(newEmail);
        }

        console.log(`Processed ${processedEmails.length} new emails.`);
        return processedEmails;

    } catch (error) {
        console.error('Error in fetchAndProcessEmails:', error.message);
        throw error;
    }
};

module.exports = { fetchAndProcessEmails };
