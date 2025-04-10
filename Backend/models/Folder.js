const mongoose = require('mongoose');

const FolderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    description: { type: String },
    photos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Folder', FolderSchema);
