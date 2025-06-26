const File = require('../models/File');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');
const { exiftool } = require('exiftool-vendored');
const mongoose = require('mongoose');

const getCategory = (mimetype) => {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype === 'application/pdf' || mimetype.startsWith('text/')) return 'document';
    return 'other';
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const category = getCategory(file.mimetype);
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

exports.uploadFile = [
    upload.single('file'),
    async (req, res) => {
        try {
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
                metadata: metadata
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
];

exports.uploadMultipleFiles = [
    upload.array('files', 10),
    async (req, res) => {
        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'Brak przes�anych plik�w' });
            }

            const files = await Promise.all(
                req.files.map(async (file) => {
                    const category = getCategory(file.mimetype);
                    const filePath = file.path;
                    const metadata = await processMetadata(filePath);
                    const folderId = req.body.folder && mongoose.isValidObjectId(req.body.folder)
                        ? req.body.folder
                        : null;

                    const newFile = new File({
                        user: req.user.userId,
                        path: path.join(category, file.filename).replace(/\\/g, '/'),
                        originalName: file.originalname,
                        mimetype: file.mimetype,
                        category: category,
                        folder: folderId,
                        metadata: metadata
                    });
                    await newFile.save();
                    return newFile;
                })
            );

            res.status(201).json(files);
        } catch (error) {
            console.error('B��d przesy�ania wielu plik�w:', error);
            res.status(500).json({
                error: 'B��d przesy�ania plik�w',
                details: error.message
            });
        }
    }
];

exports.getUserFiles = async (req, res) => {
    try {
        const files = await File.find({ user: req.user.userId });
        res.json(files);
    } catch (error) {
        res.status(500).json({ error: 'B��d pobierania plik�w' });
    }
};

exports.deleteFile = async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, user: req.user.userId });
        if (!file) {
            return res.status(404).json({ error: 'Plik nie znaleziony' });
        }

        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);

        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            await fs.promises.unlink(filePath);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                throw err;
            }
            console.warn('Plik nie istnieje na dysku:', filePath);
        }

        await File.findByIdAndDelete(req.params.id);
        res.json({ message: 'Plik usuni�ty' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'B��d serwera' });
    }
};

exports.getFileMetadata = async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, user: req.user.userId })
            .select('originalName mimetype category createdAt metadata path')
            .lean();

        if (!file) return res.status(404).json({ error: 'Plik nie znaleziony' });

        // Pobierz rozmiar pliku z systemu plik�w
        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        const stats = await fs.promises.stat(filePath);
        file.size = stats.size;

        res.json(file);
    } catch (error) {
        res.status(500).json({ error: 'B��d pobierania metadanych' });
    }
};

exports.updateFileMetadata = async (req, res) => {
    try {
        const file = await File.findOne({ _id: req.params.id, user: req.user.userId });
        if (!file) return res.status(404).json({ error: 'Plik nie znaleziony' });

        if (!file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: 'Metadane dost�pne tylko dla obraz�w' });
        }

        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);

        // Aktualizacja metadanych w pliku
        await exiftool.write(filePath, req.body);
        const newMetadata = await exiftool.read(filePath);
        await file.save();

        res.json(file);
    } catch (error) {
        console.error('Szczeg�y b��du:', error);
        res.status(500).json({
            error: 'B��d aktualizacji metadanych',
            details: error.message
        });
    }
};

exports.downloadFile = async (req, res) => {
    try {
        const { asBase64 } = req.query;
        const result = await FileService.downloadFile(req.user.userId, req.params.id, {
            asBase64: asBase64 === 'true'
        });

        if (result.content) {
            // Zwracanie jako base64
            return res.json({
                file: result.file,
                content: result.content,
                contentType: result.contentType
            });
        }

        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.file.originalName}"`);
        res.sendFile(result.filePath);
    } catch (error) {
        console.error('Błąd pobierania pliku:', error);
        res.status(404).json({ error: error.message || 'Błąd pobierania pliku' });
    }
};

exports.downloadMultipleFiles = async (req, res) => {
    try {
        const { fileIds, asBase64 } = req.body;

        if (!Array.isArray(fileIds) || fileIds.length === 0) {
            return res.status(400).json({ error: 'Brak identyfikatorów plików' });
        }

        const results = await FileService.downloadMultipleFiles(req.user.userId, fileIds, {
            asBase64: asBase64 === true
        });

        res.json({ results });
    } catch (error) {
        console.error('Błąd pobierania wielu plików:', error);
        res.status(500).json({ error: error.message || 'Błąd pobierania plików' });
    }
};


const processMetadata = async (filePath) => {
    try {
        return await exifr.parse(filePath, {
            iptc: true,
            xmp: true,
            icc: true,
            maxBufferSize: 30 * 1024 * 1024
        });
    } catch (error) {
        console.error('B��d przetwarzania metadanych:', error);
        return {};
    }
};

process.on('exit', () => exiftool.end());
process.on('SIGINT', () => exiftool.end());
process.on('uncaughtException', (err) => {
    exiftool.end();
    process.exit(1);
})
