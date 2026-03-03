const { fetchAndProcessEmails, fetchMailboxEmails } = require('../services/gmailService');
const Email = require('../models/Email');

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

