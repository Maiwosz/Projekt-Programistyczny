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

        res.json({
            path: file.path,
            originalName: file.originalName,
            contentType: file.mimetype,
            fileId: file._id
        });

    } catch (error) {
        console.error(error);
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

        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

        const file = await File.findOne({ _id: newFileId, user: userId });

        if (!file) {
            return res.status(404).json({ error: 'Plik nie istnieje lub nie należy do użytkownika' });
        }

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return res.status(400).json({ error: 'Nieprawidłowy typ pliku. Dozwolone są tylko pliki graficzne.' });
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
        console.error(error);
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
        const user = await User.findById(req.user.userId);
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

//exports.uploadProfilePicture = async (req, res) => {
exports.uploadProfilePicture = [ 
    upload.single('file'),
    async (req, res) => {
        try {
            await File.findOneAndUpdate(
            { user: req.user.userId, 
              isProfilePicture: true },
            { isProfilePicture: false }
        );

            const category = getCategoryFromMimeType(req.file.mimetype);
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
            //res.status(201).json({message: "PROBLEM TUTUAJ"});
        } catch (error) {
            console.error('Szczeg�y b��du uploadu:', error);
            res.status(500).json({
                error: 'B��d przesy�ania pliku',
                details: error.message
            });
        }
    }
];

const processMetadata = async (filePath) => {
    try {
        // Najpierw pr�bujemy odczyta� metadane za pomoc� exifr
        const metadata = await exifr.parse(filePath, {
            iptc: true,
            xmp: true,
            icc: true,
            maxBufferSize: 30 * 1024 * 1024
        });
        
        if (metadata) return metadata;
        
        // Je�li exifr nie zwr�ci� metadanych, pr�bujemy z exiftool
        return await exiftool.read(filePath);
    } catch (error) {
        console.error('B��d przetwarzania metadanych:', error);
        return {};
    }
};