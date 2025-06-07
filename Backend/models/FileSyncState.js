const mongoose = require('mongoose');

// Model do śledzenia stanu synchronizacji plików dla każdego klienta
const FileSyncStateSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    file: { type: mongoose.Schema.Types.ObjectId, ref: 'File', required: true },
    
    // Stan operacji względem poprzedniej synchronizacji
    operation: {
        type: String,
        enum: ['added', 'modified', 'deleted', 'unchanged'],
        default: 'added'
    },
    
    // Ostatni znany hash pliku u klienta
    lastKnownHash: String,
    
    // Ostatnia synchronizacja tego pliku z tym klientem
    lastSyncDate: { type: Date, default: Date.now },
    
    // Dane klienta
    clientFileId: String,     // ID pliku u klienta (np. Google Drive ID, ścieżka lokalna)
    clientFileName: String,   // Nazwa pliku u klienta
    clientPath: String,       // Pełna ścieżka u klienta
    clientLastModified: Date, // Ostatnia modyfikacja u klienta
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indeks unikalności - jeden rekord na kombinację user-client-file
FileSyncStateSchema.index({ user: 1, client: 1, file: 1 }, { unique: true });

// Indeksy dla wydajności
FileSyncStateSchema.index({ user: 1, client: 1 });
FileSyncStateSchema.index({ lastSyncDate: 1 });

// Middleware do aktualizacji updatedAt
FileSyncStateSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('FileSyncState', FileSyncStateSchema);