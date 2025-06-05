// models/Tag.js
const mongoose = require('mongoose');

const TagSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
});

// Compound index to ensure tag names are unique per user
TagSchema.index({ user: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Tag', TagSchema);