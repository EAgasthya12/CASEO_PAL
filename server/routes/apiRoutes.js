const router = require('express').Router();
const emailController = require('../controllers/emailController');
const calendarController = require('../controllers/calendarController');

// Email Routes
router.post('/emails/sync', emailController.syncEmails);
router.get('/emails', emailController.getEmails);
router.get('/emails/search', emailController.searchEmails);
router.get('/emails/scan-status', emailController.getScanStatus);
router.get('/emails/mailbox', emailController.getMailbox);
router.get('/emails/label-counts', emailController.getLabelCounts);
router.put('/emails/:id/category', emailController.updateEmailCategory);
router.post('/emails/reclassify', emailController.forceReclassify);

// User Profile Routes (Categories)
router.get('/user/categories', emailController.getUserCategories);
router.post('/user/categories', emailController.addUserCategory);

// Calendar Routes
router.post('/calendar/add-event', calendarController.addEvent);

module.exports = router;
