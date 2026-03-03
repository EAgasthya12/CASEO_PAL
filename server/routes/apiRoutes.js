const router = require('express').Router();
const emailController = require('../controllers/emailController');
const calendarController = require('../controllers/calendarController');

// Email Routes
router.post('/emails/sync', emailController.syncEmails);
router.get('/emails', emailController.getEmails);
router.get('/emails/mailbox', emailController.getMailbox);
router.get('/emails/label-counts', emailController.getLabelCounts);

// Calendar Routes
router.post('/calendar/add-event', calendarController.addEvent);

module.exports = router;
