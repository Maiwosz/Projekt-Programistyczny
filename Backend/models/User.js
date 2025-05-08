const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    email: String,
    googleId: String, // Dodane pole googleId
    profilePictureId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'File'
    },
    profilePictureUrl: String // Dodane pole dla URL zdjęcia z Google
});

UserSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

module.exports = mongoose.model('User', UserSchema);