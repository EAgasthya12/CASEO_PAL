const router = require('express').Router();
const emailController = require('../controllers/emailController');
const calendarController = require('../controllers/calendarController');

// ── Auth guard — applied to every route in this file ─────────────────────────
const isAuthenticated = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    next();
};

router.use(isAuthenticated);

// ── Email Routes ──────────────────────────────────────────────────────────────
router.post('/emails/sync',          emailController.syncEmails);
router.get('/emails',                emailController.getEmails);
router.get('/emails/search',         emailController.searchEmails);
router.get('/emails/:id/summary',    emailController.summarizeEmail);
router.get('/emails/scan-status',    emailController.getScanStatus);
router.get('/emails/priority-preview', emailController.getPriorityPreview);
router.get('/emails/mailbox',        emailController.getMailbox);
router.get('/emails/label-counts',   emailController.getLabelCounts);
router.put('/emails/:id/category',   emailController.updateEmailCategory);
router.put('/emails/:id/read',       emailController.markAsRead);
router.put('/emails/:id/useful',     emailController.markAsUseful);
router.post('/emails/reclassify',    emailController.forceReclassify);

// ── User Profile / Categories ─────────────────────────────────────────────────
router.get('/user/categories',  emailController.getUserCategories);
router.post('/user/categories', emailController.addUserCategory);
router.post('/users/ignore-sender', emailController.ignoreSender);

// ── Calendar ──────────────────────────────────────────────────────────────────
router.post('/calendar/add-event', calendarController.addEvent);

module.exports = router;
