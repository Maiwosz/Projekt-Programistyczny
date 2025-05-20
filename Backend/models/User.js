const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    email: String,
    googleId: String,
    facebookId: String,
    profilePictureId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'File'
    },
    profilePictureUrl: String,
    googleDriveTokens: {
        access_token: String,
        refresh_token: String,
        scope: String,
        token_type: String,
        expiry_date: Number
    },
    googleDriveEnabled: { type: Boolean, default: false },
    lastDriveSyncDate: { type: Date }
});

UserSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

module.exports = mongoose.model('User', UserSchema);