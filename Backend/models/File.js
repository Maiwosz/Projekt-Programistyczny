const mongoose = require('mongoose');

const FileSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    path: { type: String, required: true },
    originalName: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number }, // Rozmiar w bajtach
    category: {
        type: String,
        enum: ['image', 'document', 'audio', 'video', 'other'],
        required: true
    },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
    createdAt: { type: Date, default: Date.now },
    metadata: { type: Object, default: {} },
    
    // Podstawowy soft delete
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    
    // Informacje o modyfikacji
    fileHash: { type: String }, // Hash dla wykrywania zmian
    lastModified: { type: Date, default: Date.now }
});

// Indeksy dla wydajności
FileSchema.index({ user: 1, folder: 1 });
FileSchema.index({ user: 1, isDeleted: 1 });
FileSchema.index({ fileHash: 1 });

module.exports = mongoose.model('File', FileSchema);