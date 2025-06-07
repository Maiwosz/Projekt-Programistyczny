const mongoose = require('mongoose');

const SyncFolderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true },
    
    // Klienci, którzy synchronizują ten folder
    clients: [{
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
        clientFolderId: String,   // ID/ścieżka folderu u klienta
        clientFolderName: String, // Nazwa folderu u klienta
        clientFolderPath: String, // Ścieżka folderu u klienta
        
        // Ustawienia synchronizacji dla tego klienta
        syncDirection: { 
            type: String, 
            enum: ['bidirectional', 'to-client', 'from-client'],
            default: 'bidirectional' 
        },
        
        // Status synchronizacji
        isActive: { type: Boolean, default: true },
        lastSyncDate: { type: Date }
    }],
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indeks unikalności - jeden folder może być zsynchronizowany tylko raz
SyncFolderSchema.index({ user: 1, folder: 1 }, { unique: true });

// Middleware do aktualizacji updatedAt
SyncFolderSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('SyncFolder', SyncFolderSchema);