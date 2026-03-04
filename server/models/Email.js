const mongoose = require('mongoose');

const EmailSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    googleMessageId: { type: String, unique: true },
    subject: { type: String },
    snippet: { type: String },
    sender: { type: String },
    date: { type: Date },
    body: { type: String }, // Full body if needed

    // Intelligence Fields
    category: { type: String, default: 'Unknown' }, // Removed enum to support custom user categories
    confidence: { type: Number },
    urgency: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Low' },
    extractedDeadlines: [{
        text: String,
        date: Date,
        label: String
    }],

    isProcessed: { type: Boolean, default: false },
});

// Text index for full-text search across subject, snippet, sender and body
EmailSchema.index(
    { subject: 'text', snippet: 'text', sender: 'text', body: 'text' },
    { weights: { subject: 10, sender: 8, snippet: 5, body: 1 }, name: 'email_text_index' }
);

module.exports = mongoose.model('Email', EmailSchema);
