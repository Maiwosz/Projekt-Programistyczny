const User = require('../models/User');
const File = require('../models/File');
const bcrypt = require('bcryptjs');

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');
const { exiftool } = require('exiftool-vendored');
const mongoose = require('mongoose');
const { generateFileHash, getFileStats, getCategoryFromMimeType } = require('../utils/fileUtils');
const FileService = require('../services/FileService')

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
        const user = await User.findById(req.user.userId).populate('profilePictureId');

        if (!user || !user.profilePictureId) {
            return res.json({ path: null });
        }

        const file = user.profilePictureId;

        // Sprawdź czy plik nie jest usunięty
        if (file.isDeleted) {
            return res.json({ path: null });
        }

        res.json({
            path: file.path,
            originalName: file.originalName,
            contentType: file.mimetype,
            fileId: file._id
        });

    } catch (error) {
        console.error('Błąd pobierania zdjęcia profilowego:', error);
        res.status(500).json({ error: 'Błąd serwera' });
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

        if (!newFileId) {
            return res.status(400).json({ error: 'ID pliku jest wymagane' });
        }

        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

        // Użyj FileService do pobrania pliku
        const file = await FileService.getFileById(userId, newFileId);

        if (!file) {
            return res.status(404).json({ 
                error: 'Plik nie istnieje lub nie należy do użytkownika' 
            });
        }

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return res.status(400).json({ 
                error: 'Nieprawidłowy typ pliku. Dozwolone są tylko pliki graficzne.' 
            });
        }

        // Zaktualizuj użytkownika, ustawiając nowe zdjęcie profilowe
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { profilePictureId: newFileId },
            { new: true }
        ).populate('profilePictureId');

        res.status(200).json({
            message: 'Zaktualizowano zdjęcie profilowe',
            user: updatedUser
        });

    } catch (error) {
        console.error('Błąd aktualizacji zdjęcia profilowego:', error);
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
    const userId = req.params.id;

    try {
        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({ error: 'Użytkownik nie istnieje' });
        }

        // Usuń powiązane dane
        await Promise.all([
            File.deleteMany({ user: userId }),
            Folder.deleteMany({ user: userId }),
            Tag.deleteMany({ user: userId }),
            FileTag.deleteMany({ user: userId }),
            FileSyncState.deleteMany({ user: userId }),
            SyncFolder.deleteMany({ user: userId }),
            GoogleDriveClient.deleteMany({ user: userId }),
            Client.deleteMany({ user: userId }),
        ]);

        await user.remove();

        res.json({ message: 'Użytkownik i wszystkie powiązane dane zostały usunięte' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const category = getCategoryFromMimeType(file.mimetype);
        const uploadDir = path.resolve(process.env.UPLOADS_DIR, category);
        fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});


exports.uploadProfilePicture = [
    upload.single('file'),
    async (req, res) => {
        try {
            const userId = req.user.userId;
            const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

            if (!allowedMimeTypes.includes(req.file.mimetype)) {
                return res.status(400).json({ 
                    error: 'Nieprawidłowy typ pliku. Dozwolone są tylko pliki graficzne.' 
                });
            }

            const folderId = req.body.folder && mongoose.isValidObjectId(req.body.folder)
                ? req.body.folder
                : null;

            const fileData = {
                filePath: req.file.path,
                originalName: req.file.originalname,
                mimetype: req.file.mimetype,
                folderId: folderId,
                duplicateAction: 'rename' // Zawsze rename dla zdjęć profilowych
            };

            // Użyj FileService do utworzenia pliku
            const file = await FileService.createFile(userId, fileData);

            // Aktualizuj użytkownika - ustaw profilePictureId na nowo utworzony plik
            await User.findByIdAndUpdate(userId, { profilePictureId: file._id });

            res.status(201).json({ 
                message: 'Zdjęcie profilowe zostało zaktualizowane', 
                file 
            });

        } catch (error) {
            console.error('Szczegóły błędu uploadu zdjęcia profilowego:', error);
            res.status(500).json({
                error: 'Błąd przesyłania zdjęcia profilowego',
                details: error.message
            });
        }
    }
];