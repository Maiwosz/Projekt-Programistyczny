const mongoose = require('mongoose');

const GoogleDriveClientSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Identyfikator klienta w systemie synchronizacji
    clientId: { type: String, required: true, unique: true },
    
    // Nazwa połączenia nadana przez użytkownika
    name: { type: String, required: true },
    
    // Dane autoryzacji Google Drive
    credentials: {
        access_token: { type: String, required: true },
        refresh_token: { type: String, required: true },
        scope: String,
        token_type: { type: String, default: 'Bearer' },
        expiry_date: Number
    },
    
    // Informacje o użytkowniku Google
    googleUser: {
        id: String,
        email: String,
        name: String,
        picture: String
    },
    
    // Ustawienia synchronizacji
    syncSettings: {
        // Automatyczna synchronizacja
        autoSync: { type: Boolean, default: true },
        syncInterval: { type: Number, default: 300000 }, // 5 minut w ms
        
        // Kierunek synchronizacji
        syncDirection: { 
            type: String, 
            enum: ['bidirectional', 'upload-only', 'download-only'], 
            default: 'bidirectional' 
        },
        
        // Filtry plików
        filters: {
            allowedExtensions: [String],
            excludedExtensions: [String],
            maxFileSize: { type: Number, default: 100 * 1024 * 1024 }, // 100MB
        }
    },
    
    // Status połączenia
    status: {
        isConnected: { type: Boolean, default: true },
        lastSync: Date,
        lastError: String,
        syncInProgress: { type: Boolean, default: false }
    },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indeks unikalności - jeden użytkownik może mieć tylko jedno aktywne połączenie z Google Drive
GoogleDriveClientSchema.index({ user: 1 }, { unique: true });
GoogleDriveClientSchema.index({ clientId: 1 }, { unique: true });

// Middleware do aktualizacji updatedAt
GoogleDriveClientSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Metoda do sprawdzenia czy token wygasł
GoogleDriveClientSchema.methods.isTokenExpired = function() {
    if (!this.credentials.expiry_date) return false;
    return Date.now() >= this.credentials.expiry_date;
};

// Metoda do aktualizacji statusu ostatniej synchronizacji
GoogleDriveClientSchema.methods.updateSyncStatus = function(success, error = null) {
    this.status.lastSync = new Date();
    this.status.lastError = error;
    this.status.syncInProgress = false;
    return this.save();
};

module.exports = mongoose.model('GoogleDriveClient', GoogleDriveClientSchema);