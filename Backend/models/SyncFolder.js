const mongoose = require('mongoose');

// SyncFolder.js - poprawiony schema
const SyncFolderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Folder główny (z naszej bazy)
    folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true },
    
    // Klienci, którzy synchronizują ten folder
    clients: [{
        client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true }, // DODANE: referencja do Client
        clientId: String, // ID klienta (np. 'google-drive') - zachowane dla kompatybilności
        
        clientFolderId: String,   // Uniwersalny ID: Google Drive folder ID lub ścieżka desktop
        clientFolderName: String, // Nazwa folderu tylko do wyświetlania
        clientFolderPath: String, // DODANE: ścieżka folderu
        
        // Ustawienia synchronizacji dla tego klienta
        syncDirection: { 
            type: String, 
            enum: ['bidirectional', 'to-client', 'from-client'],
            default: 'bidirectional' 
        },
        
        // Filtry plików
        filters: {
            allowedExtensions: [String],
            excludedExtensions: [String],
            maxFileSize: Number
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