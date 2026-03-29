const mongoose = require('mongoose');

const EmailSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        googleMessageId: { type: String, unique: true },
        subject: { type: String },
        snippet: { type: String },
        sender: { type: String },
        date: { type: Date },
        body: { type: String },

        // Intelligence Fields
        category: { type: String, default: 'Unknown' },
        confidence: { type: Number },
        urgency: { type: String, enum: ['Critical', 'High', 'Medium', 'Low'], default: 'Low' },
        extractedDeadlines: [{
            text: String,
            date: Date,
            label: String
        }],

        // Read / Unread state
        isRead: { type: Boolean, default: false },
        isUseful: { type: Boolean, default: true },
        
        isProcessed: { type: Boolean, default: false },
    },
    {
        timestamps: true,  // adds createdAt + updatedAt automatically
    }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

// Fast sorted inbox queries (most common query pattern)
EmailSchema.index({ userId: 1, isUseful: 1, date: -1 });

// Fast category filtering
EmailSchema.index({ userId: 1, isUseful: 1, category: 1 });

// Fast unread count queries
EmailSchema.index({ userId: 1, isUseful: 1, isRead: 1 });

// Full-text search across subject, snippet, sender, body
EmailSchema.index(
    { subject: 'text', snippet: 'text', sender: 'text', body: 'text' },
    { weights: { subject: 10, sender: 8, snippet: 5, body: 1 }, name: 'email_text_index' }
);

module.exports = mongoose.model('Email', EmailSchema);
