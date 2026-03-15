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
        console.log(`[GmailService] Fetching inbox threads for ${user.email}...`);

        // ── Step 1: Paginate through Gmail inbox THREADS (matches Gmail UI count) ────
        // We use threads.list so the count matches what you see in Gmail's inbox —
        // conversations/threads, NOT individual messages per thread.
        // We cap at 500 most-recent threads to keep things manageable.
        const MAX_THREADS = 500;
        const allThreadIds = [];
        let pageToken = undefined;
        do {
            const res = await gmail.users.threads.list({
                userId: 'me',
                maxResults: 500,
                labelIds: ['INBOX'],
                pageToken
            });
            const threads = res.data.threads || [];
            for (const t of threads) {
                allThreadIds.push(t.id);
                if (allThreadIds.length >= MAX_THREADS) break;
            }
            pageToken = allThreadIds.length < MAX_THREADS ? res.data.nextPageToken : undefined;
        } while (pageToken);

        if (allThreadIds.length === 0) {
            console.log('[GmailService] No inbox threads found.');
            return [];
        }
        console.log(`[GmailService] Found ${allThreadIds.length} inbox threads.`);

        // ── Step 2: For each thread, get the LATEST (most recent) message ID ──────
        // We only store/display the latest message per thread — just like Gmail does.
        const fetchLatestMessageIdForThread = async (threadId) => {
            try {
                const res = await gmail.users.threads.get({
                    userId: 'me',
                    id: threadId,
                    format: 'minimal'
                });
                const messages = res.data.messages || [];
                if (messages.length === 0) return null;
                // Return the ID of the most recent message in the thread
                return messages[messages.length - 1].id;
            } catch (err) {
                console.error(`[GmailService] Thread fetch error for ${threadId}:`, err.message);
                return null;
            }
        };

        // Fetch latest message IDs for all threads (chunks of 10)
        const currentMessageIds = [];
        for (let i = 0; i < allThreadIds.length; i += 10) {
            const chunk = allThreadIds.slice(i, i + 10);
            const results = await Promise.all(chunk.map(fetchLatestMessageIdForThread));
            currentMessageIds.push(...results.filter(id => id !== null));
        }

        const currentIdSet = new Set(currentMessageIds);
        console.log(`[GmailService] Resolved ${currentMessageIds.length} current inbox message IDs.`);

        // ── Step 3: CLEANUP — remove DB records no longer in the current inbox ───
        // This fixes the inflated count: emails deleted/archived in Gmail should
        // disappear from CASEO too.
        const allStoredIds = (
            await Email.find({ userId: user._id }).select('googleMessageId').lean()
        ).map(e => e.googleMessageId);

        const staleIds = allStoredIds.filter(id => !currentIdSet.has(id));
        if (staleIds.length > 0) {
            await Email.deleteMany({ userId: user._id, googleMessageId: { $in: staleIds } });
            console.log(`[GmailService] Cleaned up ${staleIds.length} stale emails no longer in inbox.`);
        }

        // ── Step 4: Find which current IDs are NOT yet in the DB ─────────────────
        const existingIds = new Set(
            (await Email.find({ userId: user._id, googleMessageId: { $in: currentMessageIds } })
                .select('googleMessageId').lean()
            ).map(e => e.googleMessageId)
        );

        const newIds = currentMessageIds.filter(id => !existingIds.has(id));
        console.log(`[GmailService] ${existingIds.size} already stored, ${newIds.length} new to fetch & classify.`);

        if (newIds.length === 0) {
            console.log('[GmailService] All emails already up to date.');
            return await Email.find({ userId: user._id }).sort({ date: -1 }).lean();
        }

        // ── Step 5: Fetch full content for NEW messages only (chunks of 10) ───────
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

                // --- Recursive MIME part extraction ---
                // Gmail nests parts as: multipart/mixed -> multipart/alternative -> text/html
                // A shallow search misses HTML inside 3+ level deep nesting.
                // This helper walks the full tree and returns the best content found.
                const extractBody = (payload) => {
                    // Direct body data on the payload itself
                    if (payload.body?.data) {
                        return {
                            data: payload.body.data,
                            mime: payload.mimeType || 'text/plain'
                        };
                    }

                    const parts = payload.parts || [];
                    if (parts.length === 0) return null;

                    // First pass: look for text/html at this level
                    for (const part of parts) {
                        if (part.mimeType === 'text/html' && part.body?.data) {
                            return { data: part.body.data, mime: 'text/html' };
                        }
                    }

                    // Second pass: recursively descend multipart/* containers
                    for (const part of parts) {
                        if (part.mimeType?.startsWith('multipart/')) {
                            const found = extractBody(part);
                            if (found) return found;
                        }
                    }

                    // Third pass: fallback to text/plain at this level
                    for (const part of parts) {
                        if (part.mimeType === 'text/plain' && part.body?.data) {
                            return { data: part.body.data, mime: 'text/plain' };
                        }
                    }

                    // Last resort: recurse into any part that has sub-parts
                    for (const part of parts) {
                        if (part.parts) {
                            const found = extractBody(part);
                            if (found) return found;
                        }
                    }

                    return null;
                };

                const extracted = extractBody(payload);
                let body = '';
                if (extracted) {
                    body = Buffer.from(extracted.data, 'base64').toString('utf-8');
                    // If it's plain text, wrap in basic HTML so the iframe renders cleanly
                    if (extracted.mime === 'text/plain') {
                        const escaped = body
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');
                        body = `<pre style="white-space:pre-wrap;word-break:break-word;margin:0;font-family:inherit;line-height:1.7">${escaped}</pre>`;
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

        // ── Step 6: Classify in batches of 5 and save immediately to MongoDB ──────
        const userDoc = await User.findById(user._id).select('categories');
        const userCategories = userDoc?.categories || [];
        const PARALLEL = 5;
        let totalSaved = 0;

        for (let i = 0; i < emailDetails.length; i += PARALLEL) {
            const batch = emailDetails.slice(i, i + PARALLEL);

            const classified = await Promise.all(batch.map(async (e) => {
                const text = `${e.subject}\n${e.snippet}`;
                const intel = await analyzeText(text, userCategories);

                if (intel.is_new_category && intel.category && intel.category !== 'Unknown') {
                    await User.findByIdAndUpdate(
                        user._id,
                        { $addToSet: { categories: intel.category } }
                    );
                    console.log(`[GmailService] Auto-created category: "${intel.category}"`);
                }
                return { e, intel };
            }));

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
