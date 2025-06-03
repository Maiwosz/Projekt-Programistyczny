const mongoose = require('mongoose');

const SyncPairSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    localFolder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true },
    provider: { type: String, enum: ['google-drive', 'desktop', 'mobile'], required: true },
    externalFolderId: { type: String, required: true },
    externalFolderName: { type: String },
    externalFolderPath: { type: String },
    syncDirection: { 
        type: String, 
        enum: ['bidirectional', 'to-external', 'from-external'], 
        default: 'bidirectional' 
    },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastSyncDate: { type: Date },
    syncStats: {
        totalSyncs: { type: Number, default: 0 },
        successfulSyncs: { type: Number, default: 0 },
        failedSyncs: { type: Number, default: 0 },
        filesTransferred: { type: Number, default: 0 },
        lastError: String
    },
    syncSubfolders: { type: Boolean, default: true }, // Czy synchronizować podfoldery
    fileFilters: {
        allowedExtensions: [String], // np. ['.jpg', '.png']
        excludedExtensions: [String], // np. ['.tmp', '.log']
        maxFileSize: { type: Number }, // w bajtach
        minFileSize: { type: Number }  // w bajtach
    },
    autoSync: {
        enabled: { type: Boolean, default: false },
        intervalMinutes: { type: Number, default: 60 }, // Co ile minut synchronizować
        lastAutoSync: { type: Date },
        nextAutoSync: { type: Date }
    },
    deleteSync: {
        enabled: { type: Boolean, default: true }, // Czy synchronizować usuwanie
        deleteDirection: { 
            type: String, 
            enum: ['bidirectional', 'to-external', 'from-external'], 
            default: 'bidirectional' 
        }
    },
    deletedFiles: [{
        fileId: String, // ID pliku w naszej bazie lub Google Drive ID
        fileName: String,
        deletedAt: { type: Date, default: Date.now },
        deletedFrom: { type: String, enum: ['local', 'external'] },
        processed: { type: Boolean, default: false }
    }]
});

// Indeks unikalności - jeden folder może być zsynchronizowany tylko z jednym folderem zewnętrznym danego providera
SyncPairSchema.index({ localFolder: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model('SyncPair', SyncPairSchema);