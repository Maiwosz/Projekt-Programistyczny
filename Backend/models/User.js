const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    email: String,
    googleId: String,
    facebookId: String,

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

UserSchema.pre('remove', async function (next) {
    try {
        await File.deleteMany({ user: this._id });

        next();
    } catch (err) {
        next(err);
    }
});

module.exports = mongoose.model('User', UserSchema);