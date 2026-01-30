require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const passport = require('passport');

const app = express();
const PORT = process.env.PORT || 5000;
console.log('DEBUG: GOOGLE_REDIRECT_URI is:', process.env.GOOGLE_REDIRECT_URI);

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'], credentials: true }));
app.use(express.json());
app.use(require('cookie-parser')());
app.use(require('express-session')({
  secret: 'caseo_secret_key_change_me',
  resave: false,
  saveUninitialized: false
}));

// Passport Config
require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', require('./routes/authRoutes'));
app.use('/api', require('./routes/apiRoutes'));

// Basic Health Check
app.get('/', (req, res) => {
  res.json({ status: 'running', service: 'CASEO Backend', user: req.user });
});

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/caseo_db')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
