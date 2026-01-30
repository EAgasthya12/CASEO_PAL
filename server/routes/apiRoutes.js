const router = require('express').Router();
const emailController = require('../controllers/emailController');

// Email Routes
router.post('/emails/sync', emailController.syncEmails);
router.get('/emails', emailController.getEmails);

module.exports = router;
