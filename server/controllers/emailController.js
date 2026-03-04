const { fetchAndProcessEmails, fetchMailboxEmails } = require('../services/gmailService');
const Email = require('../models/Email');
const User = require('../models/User');

exports.syncEmails = async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const emails = await fetchAndProcessEmails(req.user);
        res.json({ success: true, count: emails.length, emails });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to sync emails' });
    }
};

exports.getEmails = async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const emails = await Email.find({ userId: req.user._id }).sort({ date: -1 });
        res.json(emails);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
};

exports.getMailbox = async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    // Map frontend tab names to Gmail API label IDs
    const labelMap = {
        sent: 'SENT',
        drafts: 'DRAFT',
        archive: 'TRASH'
    };
    const tab = (req.query.label || '').toLowerCase();
    const label = labelMap[tab];

    if (!label) {
        return res.status(400).json({ error: `Invalid mailbox label: '${tab}'. Use sent, drafts, or archive.` });
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

exports.getLabelCounts = async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const { google } = require('googleapis');
        const client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        client.setCredentials({
            access_token: req.user.accessToken,
            refresh_token: req.user.refreshToken
        });
        const gmail = google.gmail({ version: 'v1', auth: client });

        // Fetch SENT and DRAFT label stats in parallel
        const [sentLabel, draftLabel] = await Promise.all([
            gmail.users.labels.get({ userId: 'me', id: 'SENT' }),
            gmail.users.labels.get({ userId: 'me', id: 'DRAFT' })
        ]);

        res.json({
            sent: sentLabel.data.messagesTotal || 0,
            drafts: draftLabel.data.messagesTotal || 0
        });
    } catch (error) {
        console.error('[EmailController] getLabelCounts error:', error.message);
        res.status(500).json({ error: 'Failed to fetch label counts' });
    }
};

exports.getUserCategories = async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const user = await User.findById(req.user._id).select('categories');
        res.json({ success: true, categories: user?.categories || [] });
    } catch (error) {
        console.error('[EmailController] getUserCategories error:', error.message);
        res.status(500).json({ error: 'Failed to fetch user categories' });
    }
};

exports.addUserCategory = async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
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

exports.updateEmailCategory = async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { category } = req.body;

    if (!category) {
        return res.status(400).json({ error: 'Category string is required' });
    }

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


// Track scan status per user so frontend can poll
const scanStatus = {};

exports.getScanStatus = (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const status = scanStatus[req.user._id.toString()] || { running: false, processed: 0 };
    res.json(status);
};

exports.forceReclassify = async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const userId = req.user._id.toString();

    // If already running, don't start another
    if (scanStatus[userId]?.running) {
        return res.json({ success: true, message: 'Scan already in progress', running: true });
    }

    // Respond immediately — process in background
    scanStatus[userId] = { running: true, processed: 0 };
    res.json({ success: true, message: 'Scan started in background', running: true });

    // Fire-and-forget: process all emails without blocking the response
    fetchAndProcessEmails(req.user)
        .then(emails => {
            scanStatus[userId] = { running: false, processed: emails.length };
            console.log(`[EmailController] Scan complete for ${req.user.email}: ${emails.length} total emails.`);
        })
        .catch(err => {
            scanStatus[userId] = { running: false, processed: 0, error: err.message };
            console.error('[EmailController] Background scan error:', err.message);
        });
};


exports.searchEmails = async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const { q = '' } = req.query;
    const query = q.trim();

    if (!query) return res.json({ emails: [] });

    try {
        let filter = { userId: req.user._id };
        let emails;

        if (query.toLowerCase().startsWith('from:')) {
            // Sender search: from:superset  or  from:john@example.com
            const senderQuery = query.slice(5).trim();
            filter.sender = { $regex: senderQuery, $options: 'i' };
            emails = await Email.find(filter).sort({ date: -1 }).limit(50);
        } else {
            // Full-text search across subject, snippet, body (uses MongoDB text index)
            filter.$text = { $search: query };
            emails = await Email.find(filter, { score: { $meta: 'textScore' } })
                .sort({ score: { $meta: 'textScore' } })
                .limit(50);
        }

        res.json({ emails });
    } catch (error) {
        console.error('[EmailController] searchEmails error:', error.message);
        res.status(500).json({ error: 'Search failed' });
    }
};
