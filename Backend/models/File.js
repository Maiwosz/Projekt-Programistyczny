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
    metadata: { type: Object, default: {} },
    isProfilePicture: {type: Boolean, default: false},
    googleDriveId: { type: String },
    syncedFromDrive: { type: Boolean, default: false },
    syncedToDrive: { type: Boolean, default: false },
    lastSyncDate: { type: Date },
    
    // Pola dla obsługi soft delete i synchronizacji usuwania
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: String, enum: ['user', 'sync'] }, // Kto usunął plik
	restoredFromTrash: { type: Boolean, default: false },
    restoredAt: { type: Date },
    
    // Hash pliku do wykrywania zmian
    fileHash: { type: String }, // MD5 hash dla wykrywania modyfikacji
    lastModified: { type: Date } // Ostatnia modyfikacja pliku
   
});

module.exports = mongoose.model('File', FileSchema);