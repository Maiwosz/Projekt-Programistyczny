const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    email: String,
    googleId: String,
    facebookId: String,

    profilePictureUrl: String,

    profilePictureId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', default: null },
    
    syncSettings: {
        maxClients: { type: Number, default: 10 }, // Max liczba klientów
        globalAutoSync: { type: Boolean, default: false },
        conflictResolution: {
            type: String,
            enum: ['newest-wins', 'manual', 'keep-both'],
            default: 'newest-wins'
        }
    },

    createdAt: { type: Date, default: Date.now },
    lastActivity: { type: Date, default: Date.now }
});
UserSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

UserSchema.pre('remove', async function (next) {
    try {
        await File.deleteMany({ user: this._id });

        next();
    } catch (err) {
        next(err);
    }
});

module.exports = mongoose.model('User', UserSchema);