const { google } = require('googleapis');
const axios = require('axios');
const { analyzeText } = require('./pythonBridge');
const Email = require('../models/Email');
const User = require('../models/User');

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';


const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const fetchAndProcessEmails = async (user) => {
    try {
        if (!user.accessToken) throw new Error('No access token found for user');

        oauth2Client.setCredentials({
            access_token: user.accessToken,
            refresh_token: user.refreshToken
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        console.log(`[GmailService] Fetching ALL inbox emails for ${user.email}...`);

        // ── Step 1: Paginate through ALL Gmail inbox message IDs ──────────────
        const allMessageIds = [];
        let pageToken = undefined;
        do {
            const res = await gmail.users.messages.list({
                userId: 'me',
                maxResults: 500,          // max per page Gmail allows
                labelIds: ['INBOX'],
                pageToken
            });
            const msgs = res.data.messages || [];
            allMessageIds.push(...msgs.map(m => m.id));
            pageToken = res.data.nextPageToken;
        } while (pageToken);

        if (allMessageIds.length === 0) {
            console.log('[GmailService] No messages found.');
            return [];
        }
        console.log(`[GmailService] Found ${allMessageIds.length} total inbox emails.`);

        // ── Step 2: Find which IDs are already in the DB (skip re-processing) ──
        const existingIds = new Set(
            (await Email.find({ userId: user._id, googleMessageId: { $in: allMessageIds } })
                .select('googleMessageId').lean()
            ).map(e => e.googleMessageId)
        );

        const newIds = allMessageIds.filter(id => !existingIds.has(id));
        console.log(`[GmailService] ${existingIds.size} already stored, ${newIds.length} new to fetch & classify.`);

        if (newIds.length === 0) {
            console.log('[GmailService] All emails already up to date.');
            return await Email.find({ userId: user._id }).sort({ date: -1 }).lean();
        }

        // ── Step 3: Fetch content for NEW emails only (parallel chunks of 10) ──
        const fetchDetail = async (id) => {
            try {
                const detail = await gmail.users.messages.get({
                    userId: 'me', id, format: 'full'
                });
                const payload = detail.data.payload;
                const headers = payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                const from = headers.find(h => h.name === 'From')?.value || '(Unknown)';
                const dateHeader = headers.find(h => h.name === 'Date')?.value;
                const date = dateHeader ? new Date(dateHeader) : new Date();
                const snippet = detail.data.snippet || '';

                let body = '';
                if (payload.body?.data) {
                    body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
                } else if (payload.parts) {
                    let part = payload.parts.find(p => p.mimeType === 'text/html')
                        || payload.parts.find(p => p.mimeType === 'text/plain');
                    if (!part) {
                        for (const p of payload.parts) {
                            if (p.parts) {
                                part = p.parts.find(s => s.mimeType === 'text/html')
                                    || p.parts.find(s => s.mimeType === 'text/plain');
                                if (part) break;
                            }
                        }
                    }
                    if (part?.body?.data) {
                        body = Buffer.from(part.body.data, 'base64').toString('utf-8');
                    }
                }

                return { id, subject, from, date, snippet, body };
            } catch (err) {
                console.error(`Failed to fetch email ${id}:`, err.message);
                return null;
            }
        };

        // Fetch in parallel chunks of 10
        const emailDetails = [];
        for (let i = 0; i < newIds.length; i += 10) {
            const chunk = newIds.slice(i, i + 10);
            const results = await Promise.all(chunk.map(fetchDetail));
            emailDetails.push(...results.filter(r => r !== null));
        }

        console.log(`[GmailService] Classifying and saving ${emailDetails.length} new emails (in batches of 5)...`);

        // ── Steps 2+3 combined: classify a batch of 5, then save immediately ────
        //    This makes emails appear in the DB (and frontend) incrementally
        const userDoc = await User.findById(user._id).select('categories');
        const userCategories = userDoc?.categories || [];
        const PARALLEL = 5;
        let totalSaved = 0;

        for (let i = 0; i < emailDetails.length; i += PARALLEL) {
            const batch = emailDetails.slice(i, i + PARALLEL);

            // Classify batch in parallel
            const classified = await Promise.all(batch.map(async (e) => {
                const text = `${e.subject}\n${e.snippet}`;
                const intel = await analyzeText(text, userCategories);

                // Auto-save new Gemini-generated categories
                if (intel.is_new_category && intel.category && intel.category !== 'Unknown') {
                    await User.findByIdAndUpdate(
                        user._id,
                        { $addToSet: { categories: intel.category } }
                    );
                    console.log(`[GmailService] Auto-created category: "${intel.category}"`);
                }
                return { e, intel };
            }));

            // Save this batch immediately to MongoDB
            await Promise.all(classified.map(({ e, intel }) =>
                Email.findOneAndUpdate(
                    { googleMessageId: e.id },
                    {
                        userId: user._id,
                        googleMessageId: e.id,
                        subject: e.subject,
                        sender: e.from,
                        date: e.date,
                        snippet: e.snippet,
                        body: e.body,
                        category: intel.category || 'Personal',
                        confidence: intel.confidence,
                        urgency: intel.urgency || 'Low',
                        extractedDeadlines: intel.deadlines || [],
                        isProcessed: true
                    },
                    { upsert: true, new: true }
                ).catch(err => console.error(`Failed to save email ${e.id}:`, err.message))
            ));

            totalSaved += batch.length;
            if (totalSaved % 50 === 0 || totalSaved === emailDetails.length) {
                console.log(`[GmailService] Progress: ${totalSaved}/${emailDetails.length} saved`);
            }
        }

        console.log(`[GmailService] Done! ${totalSaved} new emails processed and saved.`);
        return await Email.find({ userId: user._id }).sort({ date: -1 }).lean();



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
