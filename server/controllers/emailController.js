const { fetchAndProcessEmails, fetchMailboxEmails, getLabelMessageCounts } = require('../services/gmailService');
const { summarizeText } = require('../services/pythonBridge');
const Email = require('../models/Email');
const User = require('../models/User');

// ── In-memory scan status (per userId) ───────────────────────────────────────
// Note: this resets on server restart — acceptable for a dev/student project.
const scanStatus = {};
const mailboxCache = new Map();
const MAILBOX_CACHE_TTL_MS = 5 * 60 * 1000;

const normalizeCategory = (category = '') =>
    category
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());

const extractSenderKey = (sender = '') => {
    const match = sender.match(/<([^>]+)>/);
    const value = (match ? match[1] : sender).trim().toLowerCase();
    return value;
};

const extractSenderDomain = (sender = '') => {
    const key = extractSenderKey(sender);
    const atIndex = key.lastIndexOf('@');
    return atIndex >= 0 ? key.slice(atIndex + 1) : '';
};

const upsertSenderRule = (rules = [], senderKey, senderDomain, category) => {
    const now = new Date();
    const nextRules = [...rules];
    const existingIndex = nextRules.findIndex((rule) => rule.senderKey === senderKey);

    if (existingIndex >= 0) {
        nextRules[existingIndex] = {
            ...nextRules[existingIndex],
            senderDomain,
            category,
            strength: Math.min((nextRules[existingIndex].strength || 1) + 1, 12),
            updatedAt: now,
        };
    } else {
        nextRules.unshift({
            senderKey,
            senderDomain,
            category,
            strength: 1,
            updatedAt: now,
        });
    }

    return nextRules
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 200);
};

const appendManualCorrection = (corrections = [], correction) =>
    [correction, ...corrections]
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 100);

const stripHtml = (text = '') =>
    text
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();

const buildPriorityFilter = () => ({
    $or: [
        { isPriority: true },
        { urgency: { $in: ['Critical', 'High'] } },
        { 'extractedDeadlines.date': { $gt: new Date() } },
    ],
});

const hasExplicitTime = (date) =>
    date.getHours() !== 0 ||
    date.getMinutes() !== 0 ||
    date.getSeconds() !== 0 ||
    date.getMilliseconds() !== 0;

const getSystemDateRange = (now = new Date()) => {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    return { startOfToday, startOfTomorrow };
};

const getEffectiveDeadline = (value) => {
    const deadline = new Date(value);
    if (Number.isNaN(deadline.getTime())) return null;

    if (!hasExplicitTime(deadline)) {
        const endOfDay = new Date(deadline);
        endOfDay.setHours(23, 59, 59, 999);
        return endOfDay;
    }

    return deadline;
};

const matchesPriorityNowDeadline = (value, now = new Date()) => {
    const deadline = new Date(value);
    if (Number.isNaN(deadline.getTime())) return false;

    const { startOfToday, startOfTomorrow } = getSystemDateRange(now);
    if (deadline < startOfToday || deadline >= startOfTomorrow) return false;

    const effectiveDeadline = getEffectiveDeadline(deadline);
    return effectiveDeadline && effectiveDeadline >= now;
};

const buildPriorityNowPreviewFilter = (now = new Date()) => {
    const { startOfToday, startOfTomorrow } = getSystemDateRange(now);

    return {
        $and: [
            buildPriorityFilter(),
            {
                extractedDeadlines: {
                    $elemMatch: {
                        date: { $gte: startOfToday, $lt: startOfTomorrow },
                    },
                },
            },
        ],
    };
};

// ── Sync / progressive scan ───────────────────────────────────────────────────
exports.syncEmails = async (req, res) => {
    try {
        const emails = await fetchAndProcessEmails(req.user);
        res.json({ success: true, count: emails.length, emails });
    } catch (error) {
        console.error('[EmailController] syncEmails error:', error.message);
        res.status(500).json({ error: 'Failed to sync emails' });
    }
};

// ── Get stored emails with pagination ────────────────────────────────────────
exports.getEmails = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(200, parseInt(req.query.limit) || 100);
        const skip  = (page - 1) * limit;

        const tab = req.query.tab || 'inbox';
        
        let query = { userId: req.user._id };

        if (tab === 'not_useful') {
            query.isUseful = false;
        } else {
            query.isUseful = { $ne: false };
        }

        if (tab === 'priority') {
            query = {
                ...query,
                ...buildPriorityFilter(),
            };
        }

        const sort = tab === 'priority'
            ? { priorityScore: -1, date: -1 }
            : { date: -1 };

        const [emails, total] = await Promise.all([
            Email.find(query)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            Email.countDocuments(query),
        ]);

        res.json({
            emails,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error('[EmailController] getEmails error:', error.message);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
};

// ── Get mailbox (Sent / Spam) from Gmail API directly ────────────────────────
exports.getMailbox = async (req, res) => {
    const labelMap = { sent: 'SENT', spam: 'SPAM', archive: 'TRASH' };
    const tab = (req.query.label || '').toLowerCase();
    const label = labelMap[tab];
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 15));
    const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : '';

    if (!label) {
        return res.status(400).json({ error: `Invalid mailbox label: '${tab}'. Use sent, spam, or archive.` });
    }

    try {
        const cacheKey = `${req.user._id}:${label}:${limit}:${pageToken || 'first'}`;
        const cached = mailboxCache.get(cacheKey);
        if (cached && (Date.now() - cached.fetchedAt) < MAILBOX_CACHE_TTL_MS) {
            return res.json(cached.payload);
        }

        console.log(`[EmailController] Fetching mailbox: ${label} for ${req.user.email}`);
        const payload = await fetchMailboxEmails(req.user, label, { count: limit, pageToken });
        mailboxCache.set(cacheKey, { payload, fetchedAt: Date.now() });
        res.json(payload);
    } catch (error) {
        console.error('[EmailController] getMailbox error:', error.message);
        res.status(500).json({ error: `Failed to fetch ${tab} emails` });
    }
};

// ── Label counts (SENT + SPAM) ────────────────────────────────────────────────
exports.getLabelCounts = async (req, res) => {
    try {
        const counts = await getLabelMessageCounts(req.user);
        res.json(counts);
    } catch (error) {
        console.error('[EmailController] getLabelCounts error:', error.message);
        res.status(500).json({ error: 'Failed to fetch label counts' });
    }
};

// ── User categories ───────────────────────────────────────────────────────────
exports.getUserCategories = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('categories');
        res.json({ success: true, categories: user?.categories || [] });
    } catch (error) {
        console.error('[EmailController] getUserCategories error:', error.message);
        res.status(500).json({ error: 'Failed to fetch user categories' });
    }
};

exports.addUserCategory = async (req, res) => {
    return res.status(403).json({
        error: 'Categories are created automatically by the classifier. You can only reassign emails to existing categories.',
    });
};

// ── Update email category ─────────────────────────────────────────────────────
exports.updateEmailCategory = async (req, res) => {
    const normalizedCategory = normalizeCategory(req.body.category || '');
    if (!normalizedCategory) return res.status(400).json({ error: 'Category string is required' });

    try {
        const user = await User.findById(req.user._id).select('categories categoryLearning');
        const existingCategories = user?.categories || [];
        if (!existingCategories.includes(normalizedCategory)) {
            return res.status(400).json({
                error: 'You can only assign emails to existing categories. New categories are created automatically by the model.',
            });
        }

        const email = await Email.findOne({ _id: req.params.id, userId: req.user._id });
        if (!email) return res.status(404).json({ error: 'Email not found' });

        const previousCategory = email.category || '';
        if (previousCategory === normalizedCategory) {
            return res.json({ success: true, email, categories: existingCategories });
        }

        const senderKey = extractSenderKey(email.sender || '');
        const senderDomain = extractSenderDomain(email.sender || '');

        email.category = normalizedCategory;
        email.confidence = Math.max(email.confidence || 0, 0.99);
        email.isProcessed = true;
        await email.save();

        const nextSenderRules = senderKey
            ? upsertSenderRule(user?.categoryLearning?.senderRules, senderKey, senderDomain, normalizedCategory)
            : (user?.categoryLearning?.senderRules || []);
        const nextCorrections = appendManualCorrection(user?.categoryLearning?.manualCorrections, {
            emailId: email.googleMessageId || String(email._id),
            senderKey,
            senderDomain,
            originalCategory: previousCategory,
            correctedCategory: normalizedCategory,
            subject: email.subject || '',
            updatedAt: new Date(),
        });

        await User.findByIdAndUpdate(req.user._id, {
            $set: {
                categories: existingCategories,
                categoryLearning: {
                    senderRules: nextSenderRules,
                    manualCorrections: nextCorrections,
                },
            },
        });

        if (senderKey) {
            await Email.updateMany(
                {
                    userId: req.user._id,
                    sender: email.sender,
                    _id: { $ne: email._id },
                    isUseful: { $ne: false },
                },
                {
                    $set: {
                        category: normalizedCategory,
                        isProcessed: true,
                    },
                    $max: { confidence: 0.96 },
                }
            );
        }

        const refreshedEmail = await Email.findById(email._id);
        res.json({ success: true, email: refreshedEmail, categories: existingCategories });
    } catch (error) {
        console.error('[EmailController] updateEmailCategory error:', error.message);
        res.status(500).json({ error: 'Failed to update email category' });
    }
};

// ── Mark email as read ────────────────────────────────────────────────────────
exports.markAsRead = async (req, res) => {
    try {
        const email = await Email.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { isRead: true },
            { new: true }
        );
        if (!email) return res.status(404).json({ error: 'Email not found' });
        res.json({ success: true, email });
    } catch (error) {
        console.error('[EmailController] markAsRead error:', error.message);
        res.status(500).json({ error: 'Failed to mark email as read' });
    }
};

// ── Mark email as not useful (or useful) ──────────────────────────────────────
exports.markAsUseful = async (req, res) => {
    try {
        const { isUseful } = req.body;
        const email = await Email.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { isUseful: !!isUseful },
            { new: true }
        );
        if (!email) return res.status(404).json({ error: 'Email not found' });
        res.json({ success: true, email });
    } catch (error) {
        console.error('[EmailController] markAsUseful error:', error.message);
        res.status(500).json({ error: 'Failed to update email usefulness' });
    }
};

// ── Ignore Sender ─────────────────────────────────────────────────────────────
exports.ignoreSender = async (req, res) => {
    try {
        const { sender } = req.body;
        if (!sender) return res.status(400).json({ error: 'Sender string is required' });

        // 1. Add to user blocklist
        await User.findByIdAndUpdate(req.user._id, { $addToSet: { ignoredSenders: sender } });

        // 2. Retroactively flag all existing emails from this exact sender string as Not Useful
        const result = await Email.updateMany(
            { userId: req.user._id, sender: sender },
            { $set: { isUseful: false } }
        );

        res.json({ success: true, message: `Ignored sender ${sender}`, updatedCount: result.modifiedCount });
    } catch (error) {
        console.error('[EmailController] ignoreSender error:', error.message);
        res.status(500).json({ error: 'Failed to ignore sender' });
    }
};

// ── Scan status polling ───────────────────────────────────────────────────────
exports.getScanStatus = (req, res) => {
    const status = scanStatus[req.user._id.toString()] || { running: false, processed: 0, total: 0 };
    res.json(status);
};

exports.getPriorityPreview = async (req, res) => {
    try {
        const now = new Date();
        const emails = await Email.find({
            userId: req.user._id,
            isUseful: { $ne: false },
            ...buildPriorityNowPreviewFilter(now),
        })
            .sort({ priorityScore: -1, date: -1 })
            .limit(25)
            .lean();

        const filteredEmails = emails.filter((email) =>
            (email.extractedDeadlines || []).some((deadline) =>
                matchesPriorityNowDeadline(deadline.date, now)
            )
        );

        res.json({ emails: filteredEmails.slice(0, 8) });
    } catch (error) {
        console.error('[EmailController] getPriorityPreview error:', error.message);
        res.status(500).json({ error: 'Failed to fetch priority preview' });
    }
};

// ── Force reclassify (background) ────────────────────────────────────────────
exports.forceReclassify = async (req, res) => {
    const userId = req.user._id.toString();
    const maxThreads = Math.min(500, parseInt(req.query.maxThreads) || 100);

    const currentScan = scanStatus[userId];
    if (currentScan?.running && (currentScan.maxThreads >= maxThreads)) {
        return res.json({ success: true, message: 'Scan already in progress', running: true });
    }

    scanStatus[userId] = { running: true, processed: 0, total: 0, maxThreads };
    res.json({ success: true, message: 'Scan started in background', running: true });

    const onProgress = (processed, total, running = true) => {
        scanStatus[userId] = { running, processed, total, maxThreads };
    };

    fetchAndProcessEmails(req.user, onProgress, maxThreads)
        .then(result => {
            // result is now { emails, newCount }
            scanStatus[userId] = { running: false, processed: result.newCount, total: result.newCount, maxThreads };
            console.log(`[EmailController] Scan complete for ${req.user.email}: ${result.newCount} new emails.`);
        })
        .catch(err => {
            scanStatus[userId] = { running: false, processed: 0, total: 0, error: err.message };
            console.error('[EmailController] Background scan error:', err.message);
        });
};

// ── Full-text search ──────────────────────────────────────────────────────────
exports.searchEmails = async (req, res) => {
    const { q = '' } = req.query;
    const query = q.trim();
    if (!query) return res.json({ emails: [] });

    try {
        let filter = { userId: req.user._id };
        let emails;

        if (query.toLowerCase().startsWith('from:')) {
            const senderQuery = query.slice(5).trim();
            filter.sender = { $regex: senderQuery, $options: 'i' };
            emails = await Email.find(filter).sort({ date: -1 }).limit(50).lean();
        } else {
            filter.$text = { $search: query };
            emails = await Email.find(filter, { score: { $meta: 'textScore' } })
                .sort({ score: { $meta: 'textScore' } })
                .limit(50)
                .lean();
        }

        res.json({ emails });
    } catch (error) {
        console.error('[EmailController] searchEmails error:', error.message);
        res.status(500).json({ error: 'Search failed' });
    }
};

exports.summarizeEmail = async (req, res) => {
    try {
        const email = await Email.findOne({ _id: req.params.id, userId: req.user._id });
        if (!email) return res.status(404).json({ error: 'Email not found' });

        // If we already have a generated summary, return it immediately
        if (email.summaryData && email.summaryData.summary) {
            return res.json({ success: true, ...email.summaryData });
        }

        const summarySource = [email.subject, email.snippet, stripHtml(email.body || '')]
            .filter(Boolean)
            .join('\n\n')
            .trim();

        if (!summarySource) {
            return res.status(400).json({ error: 'Email has no content to summarize' });
        }

        const result = await summarizeText(summarySource, email.sender || '', email.subject || '');
        
        // Save the generated summary back to the database for future use
        email.summaryData = result;
        await email.save();

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[EmailController] summarizeEmail error:', error.message);
        res.status(500).json({ error: 'Failed to summarize email' });
    }
};
