const { google } = require('googleapis');
const { analyzeBatch } = require('./pythonBridge');
const Email = require('../models/Email');
const User = require('../models/User');

const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:5001';

// ── Shared OAuth2 client factory ──────────────────────────────────────────────
// Centralises credential setup — avoids copy-pasting across service + controllers.
const getOAuthClient = (user) => {
    const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );
    client.setCredentials({
        access_token: user.accessToken,
        refresh_token: user.refreshToken,
    });
    return client;
};


/**
 * Fetch and process inbox emails with PROGRESSIVE LOADING:
 *  1. Immediately classify & save the 50 most recent threads (fast first load).
 *  2. Classify & save the remaining threads in the background (no extra response needed).
 *
 * @param {Object} user  - Authenticated user document
 * @param {Function} [onProgress] - Optional callback(processed, total) for progress updates
 */
const fetchAndProcessEmails = async (user, onProgress, maxThreads = 100) => {
    try {
        if (!user.accessToken) throw new Error('No access token found for user');

        const auth = getOAuthClient(user);
        const gmail = google.gmail({ version: 'v1', auth });
        console.log(`[GmailService] Fetching inbox threads for ${user.email}…`);

        // ── Step 1: Paginate through inbox THREADS (matches Gmail UI thread count) ──
        const MAX_THREADS = maxThreads;
        const allThreadIds = [];
        let pageToken;
        do {
            const res = await gmail.users.threads.list({
                userId: 'me',
                maxResults: 500,
                labelIds: ['INBOX'],
                pageToken,
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

        // ── Step 2: Get the latest message ID for each thread (chunks of 20) ─────
        const fetchLatestMessageId = async (threadId) => {
            try {
                const res = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'minimal' });
                const msgs = res.data.messages || [];
                return msgs.length ? msgs[msgs.length - 1].id : null;
            } catch (err) {
                console.error(`[GmailService] Thread fetch error ${threadId}:`, err.message);
                return null;
            }
        };

        const currentMessageIds = [];
        for (let i = 0; i < allThreadIds.length; i += 20) { // upgraded: 10 → 20
            const chunk = allThreadIds.slice(i, i + 20);
            const results = await Promise.all(chunk.map(fetchLatestMessageId));
            currentMessageIds.push(...results.filter(Boolean));
        }

        const currentIdSet = new Set(currentMessageIds);
        console.log(`[GmailService] Resolved ${currentMessageIds.length} current inbox message IDs.`);

        // ── Step 3: Cleanup — (Skipping aggressive cleanup to preserve scanned emails) ──
        /*
        const storedIds = (
            await Email.find({ userId: user._id }).select('googleMessageId').lean()
        ).map(e => e.googleMessageId);

        const staleIds = storedIds.filter(id => !currentIdSet.has(id));
        if (staleIds.length > 0) {
            await Email.deleteMany({ userId: user._id, googleMessageId: { $in: staleIds } });
            console.log(`[GmailService] Cleaned up ${staleIds.length} stale emails.`);
        }
        */

        // ── Step 4: Find which IDs are new (not yet in DB) ───────────────────────
        const existingIds = new Set(
            (await Email.find({ userId: user._id, googleMessageId: { $in: currentMessageIds } })
                .select('googleMessageId').lean()
            ).map(e => e.googleMessageId)
        );

        const newIds = currentMessageIds.filter(id => !existingIds.has(id));
        console.log(`[GmailService] ${existingIds.size} already stored, ${newIds.length} new to classify.`);

        if (newIds.length === 0) {
            console.log('[GmailService] All emails already up to date.');
            const existing = await Email.find({ userId: user._id }).sort({ date: -1 }).lean();
            return { emails: existing, newCount: 0 };
        }

        // ── Step 5: Fetch full content for new messages (chunks of 20) ──────────
        const fetchDetail = async (id) => {
            try {
                const detail = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
                const payload = detail.data.payload;
                const headers = payload.headers;
                const get = (name) => headers.find(h => h.name === name)?.value || '';
                const subject = get('Subject') || '(No Subject)';
                const from = get('From') || '(Unknown)';
                const dateHeader = get('Date');
                const date = dateHeader ? new Date(dateHeader) : new Date();
                const snippet = detail.data.snippet || '';

                // Recursive MIME part extractor
                const extractBody = (p) => {
                    if (p.body?.data) return { data: p.body.data, mime: p.mimeType || 'text/plain' };
                    const parts = p.parts || [];
                    for (const part of parts) {
                        if (part.mimeType === 'text/html' && part.body?.data)
                            return { data: part.body.data, mime: 'text/html' };
                    }
                    for (const part of parts) {
                        if (part.mimeType?.startsWith('multipart/')) {
                            const found = extractBody(part);
                            if (found) return found;
                        }
                    }
                    for (const part of parts) {
                        if (part.mimeType === 'text/plain' && part.body?.data)
                            return { data: part.body.data, mime: 'text/plain' };
                    }
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
                console.error(`[GmailService] Failed to fetch email ${id}:`, err.message);
                return null;
            }
        };

        // ── Step 6: PROGRESSIVE — process PRIORITY batch (50 newest) first ───────
        const PRIORITY_BATCH = 50;
        const priorityIds = newIds.slice(0, PRIORITY_BATCH);
        const remainingIds = newIds.slice(PRIORITY_BATCH);

        const userDoc = await User.findById(user._id).select('categories ignoredSenders');
        const userCategories = userDoc?.categories || [];
        const ignoredSenders = userDoc?.ignoredSenders || [];

        console.log(`[GmailService] Priority batch: classifying ${priorityIds.length} newest emails first…`);
        await _processAndSave(gmail, priorityIds, user, userCategories, ignoredSenders);
        if (onProgress) onProgress(priorityIds.length, newIds.length);

        // Return the first page of results immediately — the caller gets fast data
        const firstPage = await Email.find({ userId: user._id }).sort({ date: -1 }).lean();

        // ── Step 7: Background — process remaining emails without blocking ────────
        if (remainingIds.length > 0) {
            _processRemainingBackground(gmail, remainingIds, user, userCategories, ignoredSenders, onProgress, priorityIds.length, newIds.length);
        }

        return { emails: firstPage, newCount: newIds.length };

    } catch (error) {
        console.error('[GmailService] fetchAndProcessEmails error:', error.message);
        throw error;
    }
};

/**
 * Internal: fetch details + batch-classify + save a list of message IDs.
 */
const _processAndSave = async (gmail, ids, user, userCategories, ignoredSenders = []) => {
    if (ids.length === 0) return;

    // Fetch details in parallel chunks of 20
    const emailDetails = [];
    for (let i = 0; i < ids.length; i += 20) {
        const chunk = ids.slice(i, i + 20);
        const results = await Promise.all(chunk.map(id => _fetchDetail(gmail, id)));
        emailDetails.push(...results.filter(Boolean));
    }

    if (emailDetails.length === 0) return;

    // Batch-classify all at once via /classify-batch
    const batchInput = emailDetails.map(e => ({
        id: e.id,
        text: `${e.subject}\n${e.snippet}`,
        sender: e.from,
    }));

    const intelMap = await analyzeBatch(batchInput, userCategories);

    // Persist + auto-create new categories
    await Promise.allSettled(
        emailDetails.map(async (e) => {
            const intel = intelMap[e.id] || { category: 'Personal', confidence: 0.4, urgency: 'Low', deadlines: [] };

            if (intel.is_new_category && intel.category && intel.category !== 'Unknown') {
                await User.findByIdAndUpdate(user._id, { $addToSet: { categories: intel.category } });
                console.log(`[GmailService] Auto-created category: "${intel.category}"`);
            }

            return Email.findOneAndUpdate(
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
                    isProcessed: true,
                    isRead: false,
                    isUseful: !ignoredSenders.includes(e.from),
                },
                { upsert: true, new: true }
            );
        })
    );

    console.log(`[GmailService] Saved ${emailDetails.length} emails.`);
};

/**
 * Internal: fetch full email detail for a single message ID.
 */
const _fetchDetail = async (gmail, id) => {
    try {
        const detail = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
        const payload = detail.data.payload;
        const headers = payload.headers;
        const get = (name) => headers.find(h => h.name === name)?.value || '';
        const subject = get('Subject') || '(No Subject)';
        const from = get('From') || '(Unknown)';
        const to = get('To') || '';
        const dateHeader = get('Date');
        const date = dateHeader ? new Date(dateHeader) : new Date();
        const snippet = detail.data.snippet || '';

        const extractBody = (p) => {
            if (p.body?.data) return { data: p.body.data, mime: p.mimeType || 'text/plain' };
            const parts = p.parts || [];
            for (const part of parts) {
                if (part.mimeType === 'text/html' && part.body?.data)
                    return { data: part.body.data, mime: 'text/html' };
            }
            for (const part of parts) {
                if (part.mimeType?.startsWith('multipart/')) {
                    const found = extractBody(part);
                    if (found) return found;
                }
            }
            for (const part of parts) {
                if (part.mimeType === 'text/plain' && part.body?.data)
                    return { data: part.body.data, mime: 'text/plain' };
            }
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
            if (extracted.mime === 'text/plain') {
                const escaped = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                body = `<pre style="white-space:pre-wrap;word-break:break-word;margin:0;font-family:inherit;line-height:1.7">${escaped}</pre>`;
            }
        }

        return { id, subject, from, to, date, snippet, body };
    } catch (err) {
        console.error(`[GmailService] Failed to fetch email ${id}:`, err.message);
        return null;
    }
};

/**
 * Internal: process remaining emails in background
 */
const _processRemainingBackground = (gmail, ids, user, userCategories, ignoredSenders, onProgress, processed, total) => {
    setImmediate(async () => {
        try {
            const CHUNK = 50;
            for (let i = 0; i < ids.length; i += CHUNK) {
                const chunk = ids.slice(i, i + CHUNK);
                await _processAndSave(gmail, chunk, user, userCategories, ignoredSenders);
                processed += chunk.length;
                if (onProgress) onProgress(processed, total, true);
                console.log(`[GmailService] Background progress: ${processed}/${total}`);
            }
            console.log(`[GmailService] Background processing complete.`);
            if (onProgress) onProgress(total, total, false); // Final completion signal
        } catch (err) {
            console.error('[GmailService] Background processing error:', err.message);
            if (onProgress) onProgress(processed, total, false); // Stop on error
        }
    });
};

/**
 * Fetch emails from a Gmail mailbox label (SENT, SPAM, TRASH) directly from Gmail API.
 * No DB storage, no AI analysis.
 */
const fetchMailboxEmails = async (user, label = 'SENT', count = 30) => {
    try {
        if (!user.accessToken) throw new Error('No access token found for user');

        const auth = getOAuthClient(user);
        const gmail = google.gmail({ version: 'v1', auth });

        console.log(`[GmailService] Fetching ${label} mailbox for ${user.email}…`);

        const response = await gmail.users.messages.list({ userId: 'me', maxResults: count, labelIds: [label] });
        const messages = response.data.messages;
        if (!messages || messages.length === 0) {
            console.log(`[GmailService] No messages found in ${label}.`);
            return [];
        }

        const details = await Promise.all(
            messages.map(async (msg) => {
                const fetched = await _fetchDetail(gmail, msg.id);
                if (!fetched) return null;
                
                return {
                    _id: fetched.id,
                    googleMessageId: fetched.id,
                    subject: fetched.subject,
                    sender: fetched.from,
                    recipient: fetched.to,
                    date: fetched.date,
                    snippet: fetched.snippet,
                    body: fetched.body,
                    mailbox: label,
                };
            })
        );

        const results = details.filter(Boolean);
        console.log(`[GmailService] Fetched ${results.length} messages from ${label}.`);
        return results;

    } catch (error) {
        console.error(`[GmailService] fetchMailboxEmails error (${label}):`, error.message);
        throw error;
    }
};

/**
 * Get Gmail label message counts for SENT and SPAM.
 * Added error resilience: if one fails (e.g. label hidden), other still returns.
 */
const getLabelMessageCounts = async (user) => {
    const auth = getOAuthClient(user);
    const gmail = google.gmail({ version: 'v1', auth });
    
    const fetchCount = async (id) => {
        try {
            const res = await gmail.users.labels.get({ userId: 'me', id });
            return res.data.messagesTotal || 0;
        } catch (e) {
            console.warn(`[GmailService] Could not fetch count for label ${id}:`, e.message);
            return 0; // Fallback to 0 if label API fails
        }
    };

    const [sent, spam, priority] = await Promise.all([
        fetchCount('SENT'),
        fetchCount('SPAM'),
        Email.countDocuments({
            userId: user._id,
            isUseful: { $ne: false },
            $or: [
                { urgency: { $in: ['Critical', 'High'] } },
                { 'extractedDeadlines.date': { $gt: new Date() } }
            ]
        })
    ]);

    return { sent, spam, priority };
};

module.exports = { fetchAndProcessEmails, fetchMailboxEmails, getLabelMessageCounts };
