// models/FileTag.js
const mongoose = require('mongoose');

const FileTagSchema = new mongoose.Schema({
    file: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
    tag: { type: mongoose.Schema.Types.ObjectId, ref: 'Tag', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

// Compound index to ensure a tag is only added once to a file
FileTagSchema.index({ file: 1, tag: 1 }, { unique: true });

module.exports = mongoose.model('FileTag', FileTagSchema);