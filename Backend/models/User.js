const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    email: String,
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