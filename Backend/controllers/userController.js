const User = require('../models/User');
const bcrypt = require('bcryptjs');

exports.getCurrentUserEmail = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('email');
        res.json({email: user.email});
    } catch (error) {
        res.status(500).json({ error: 'Blad serwera' });
    }
};

exports.getCurrentUserLogin = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('username');
        res.json({login: user.username });
    } catch (error) {
        res.status(500).json({ error: 'Blad serwera' });
    }
};

exports.getCurrentUserProfilePicture = async (req, res) => {
    try {
        const fileId = await User.findById(req.user.userId).select('profilePictureId');
        const file = await File.findById(fileId).select(path);
        res.json(file);
    } catch (error) {
        res.status(500).json({ error: 'Blad serwera' });
    }
};

exports.updateCurrentUserEmail = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email jest wymagany' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            { email },
            { new: true }
        ).select('email');

        res.json({ message: 'Email zaktualizowany', email: updatedUser.email });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

exports.updateCurrentUserLogin = async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Login jest wymagany' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            { username },
            { new: true }
        ).select('username');

        res.json({ message: 'Login zaktualizowany', username: updatedUser.username });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

exports.updateCurrentUserProfilePicture = async (req, res) => {
    try {
        const { profilePictureId } = req.body;

        if (!profilePictureId) {
            return res.status(400).json({ error: 'ID zdjęcia profilowego jest wymagane' });
        }

        const file = await File.findById(profilePictureId);
        if (!file) {
            return res.status(404).json({ error: 'Plik nie istnieje' });
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            { profilePictureId },
            { new: true }
        ).select('profilePictureId');

        res.json({ message: 'Zdjęcie profilowe zaktualizowane', profilePictureId: updatedUser.profilePictureId });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

exports.updateCurrentUserPassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ error: 'Stare i nowe hasło są wymagane' });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Nieprawidłowe stare hasło' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ message: 'Hasło zostało zaktualizowane' });
    } catch (error) {
        res.status(500).json({ error: 'Błąd serwera' });
    }
};
