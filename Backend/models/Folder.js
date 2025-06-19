const crypto = require('crypto');
const mongoose = require('mongoose');

const FolderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    description: { type: String },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    createdAt: { type: Date, default: Date.now },

    // NEW FIELDS
    sharedLink: { type: String, unique: true, sparse: true },
    isShared: { type: Boolean, default: false }
});

module.exports = mongoose.model('Folder', FolderSchema);