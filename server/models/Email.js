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
    category: { type: String, enum: ['Academic', 'Internship', 'Event', 'Personal', 'Unknown'], default: 'Unknown' },
    confidence: { type: Number },
    urgency: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Low' },
    extractedDeadlines: [{
        text: String,
        date: Date,
        label: String
    }],

    isProcessed: { type: Boolean, default: false },
});

module.exports = mongoose.model('Email', EmailSchema);
