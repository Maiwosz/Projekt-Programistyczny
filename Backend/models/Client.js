const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Typ klienta
    type: { 
        type: String, 
        enum: ['desktop', 'mobile', 'web', 'server-integration', 'google-drive'],
        required: true 
    },
    
    // Nazwa/opis klienta (np. "Desktop - Windows PC", "Mobile - iPhone")
    name: { type: String, required: true },
    
    // Podstawowe metadane
    metadata: {
        type: Object,
        default: {}
    },
    
    // Status klienta
    isActive: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// indeks - unikalność kombinacji user + _id + type
// To pozwala każdemu użytkownikowi mieć własnego klienta Google Drive
ClientSchema.index({ user: 1, _id: 1, type: 1 }, { unique: true });

// Middleware do aktualizacji updatedAt
ClientSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Client', ClientSchema);