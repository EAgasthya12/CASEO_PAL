const { fetchAndProcessEmails, fetchMailboxEmails, getLabelMessageCounts } = require('../services/gmailService');
const Email = require('../models/Email');
const User = require('../models/User');

// ── In-memory scan status (per userId) ───────────────────────────────────────
// Note: this resets on server restart — acceptable for a dev/student project.
const scanStatus = {};

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
            const now = new Date();
            query.$or = [
                { urgency: { $in: ['Critical', 'High'] } },
                { 'extractedDeadlines.date': { $gt: now } }
            ];
        }

        const [emails, total] = await Promise.all([
            Email.find(query)
                .sort({ date: -1 })
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

    if (!label) {
        return res.status(400).json({ error: `Invalid mailbox label: '${tab}'. Use sent, spam, or archive.` });
    }

    try {
        console.log(`[EmailController] Fetching mailbox: ${label} for ${req.user.email}`);
        const emails = await fetchMailboxEmails(req.user, label, 30);
        res.json(emails);
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
    const { category } = req.body;
    if (!category || category.trim() === '') {
        return res.status(400).json({ error: 'Category name is required' });
    }
    try {
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { $addToSet: { categories: category.trim() } },
            { new: true }
        ).select('categories');
        res.json({ success: true, categories: user.categories });
    } catch (error) {
        console.error('[EmailController] addUserCategory error:', error.message);
        res.status(500).json({ error: 'Failed to add user category' });
    }
};

// ── Update email category ─────────────────────────────────────────────────────
exports.updateEmailCategory = async (req, res) => {
    const { category } = req.body;
    if (!category) return res.status(400).json({ error: 'Category string is required' });

    try {
        const email = await Email.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { category: category.trim() },
            { new: true }
        );
        if (!email) return res.status(404).json({ error: 'Email not found' });
        res.json({ success: true, email });
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
