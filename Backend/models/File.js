const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    path: { type: String, required: true },
    originalName: { type: String, required: true },
    mimetype: { type: String, required: true },
    category: {
        type: String,
        enum: ['image', 'document', 'audio', 'video', 'other'],
        required: true
    },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    createdAt: { type: Date, default: Date.now },
    metadata: { type: Object, default: {} }
});

module.exports = mongoose.model('File', FileSchema);