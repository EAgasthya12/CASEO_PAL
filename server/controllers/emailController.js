const { fetchAndProcessEmails } = require('../services/gmailService');
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
