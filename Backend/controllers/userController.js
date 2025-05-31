const User = require('../models/User');
const File = require('../models/File');
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
        const file = await File.findOne({ user: req.user.userId, isProfilePicture: true }).select('path');
        res.json({ path: file.path });

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
        const userId = req.user.userId; 
        const newFileId = req.body.fileId;

        await File.findOneAndUpdate(
            { user: userId, isProfilePicture: true },
            { isProfilePicture: false }
        );

        const updatedFile = await File.findOneAndUpdate(
            { _id: newFileId, user: userId },
            { isProfilePicture: true },
        );
        res.status(200).json({ message: 'Zaktualizowano zdjęcie profilowe', file: updatedFile });

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

exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'Użytkownik nie istnieje' });
        }

        await user.remove();

        res.json({ message: 'Użytkownik i jego pliki zostały usunięte' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

exports.uploadProfilePicture = async (req, res) => {
    upload.single('file'),
    async (req, res) => {
        try {
            await File.findOneAndUpdate(
            { user: userId, isProfilePicture: true },
            { isProfilePicture: false }
        );

            const category = getCategory(req.file.mimetype);
            const filePath = req.file.path;
            const metadata = await processMetadata(filePath);
            const folderId = req.body.folder && mongoose.isValidObjectId(req.body.folder)
                ? req.body.folder
                : null;

            const file = new File({
                user: req.user.userId,
                path: path.join(category, req.file.filename).replace(/\\/g, '/'),
                originalName: req.file.originalname,
                mimetype: req.file.mimetype,
                category: category,
                folder: folderId,
                metadata: metadata,
                isProfilePicture: true
            });
            await file.save();
            res.status(201).json(file);
        } catch (error) {
            console.error('Szczeg�y b��du uploadu:', error);
            res.status(500).json({
                error: 'B��d przesy�ania pliku',
                details: error.message
            });
        }
    }
};