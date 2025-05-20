const mongoose = require('mongoose');

const FolderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    description: { type: String },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    createdAt: { type: Date, default: Date.now },
    googleDriveId: { type: String },
    syncedFromDrive: { type: Boolean, default: false },
    syncedToDrive: { type: Boolean, default: false },
    lastSyncDate: { type: Date }
});

module.exports = mongoose.model('Folder', FolderSchema);