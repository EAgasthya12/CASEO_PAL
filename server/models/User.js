const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String },
    accessToken: { type: String },
    refreshToken: { type: String },
    photo: { type: String },
    categories: {
        type: [String],
        default: ['Academic', 'Internship', 'Job', 'Event', 'Finance', 'Newsletter', 'Personal']
    },
    ignoredSenders: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);
