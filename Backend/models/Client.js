const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Identyfikator klienta (generowany przez klienta lub serwer)
    clientId: { type: String, required: true, unique: true },
    
    // Typ klienta - usunięto 'google-drive' (będzie osobny model)
    type: { 
        type: String, 
        enum: ['desktop', 'mobile', 'web', 'server-integration'], 
        required: true 
    },
    
    // Nazwa/opis klienta (np. "Desktop - Windows PC", "Mobile - iPhone")
    name: { type: String, required: true },
    
    // Podstawowe metadane - usunięto sekcję googleDrive
    metadata: {
        // Inne metadane specyficzne dla różnych typów klientów
        type: Object,
        default: {}
    },
    
    // Status klienta
    isActive: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indeks unikalności - jeden user może mieć wielu klientów, ale każdy clientId musi być unikalny
ClientSchema.index({ user: 1, clientId: 1 }, { unique: true });

// Middleware do aktualizacji updatedAt
ClientSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Client', ClientSchema);