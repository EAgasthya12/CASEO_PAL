require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const passport = require('passport');

const app = express();
const PORT = process.env.PORT || 5000;

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow the CLIENT_URL from env, plus common local dev ports as fallback.
const allowedOrigins = [
    process.env.CLIENT_URL,
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
].filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(require('cookie-parser')());

// ── Session ───────────────────────────────────────────────────────────────────
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
    console.warn('⚠️  SESSION_SECRET not set in .env — using insecure default. Set it before deploying!');
}
app.use(require('express-session')({
    secret: SESSION_SECRET || 'caseo_dev_secret_please_change',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));

// ── Passport ──────────────────────────────────────────────────────────────────
require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', require('./routes/authRoutes'));
app.use('/api',  require('./routes/apiRoutes'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'running', service: 'CASEO Backend', authenticated: !!req.user });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('[Server] Unhandled error:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── MongoDB ───────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/caseo_db')
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));

app.listen(PORT, () => {
    console.log(`🚀 CASEO Backend running on http://localhost:${PORT}`);
});
