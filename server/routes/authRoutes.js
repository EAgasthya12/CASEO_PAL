const router = require('express').Router();
const passport = require('passport');

// Auth Login
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar']
}));

// Callback
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        // Successful authentication, redirect dashboard.
        // In a decoupled setup (React on port 5173), we might need to send a token or redirect with a cookie.
        // simpler approach: Redirect to client URL
        res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard`);
    }
);

router.get('/current_user', (req, res) => {
    res.send(req.user);
});

router.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect(process.env.CLIENT_URL || 'http://localhost:5173');
    });
});

module.exports = router;
