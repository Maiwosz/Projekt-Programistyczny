const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { getCategoryFromMimeType } = require('../utils/fileUtils');
const FileService = require('../services/FileService');
const SyncService = require('../services/SyncService');

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

exports.uploadFile = [
    upload.single('file'),
    async (req, res) => {
        try {
            const category = getCategoryFromMimeType(req.file.mimetype);
            const folderId = req.body.folder && mongoose.isValidObjectId(req.body.folder)
                ? req.body.folder
                : null;

            const fileData = {
                filePath: req.file.path,
                originalName: req.file.originalname,
                mimetype: req.file.mimetype,
                folderId: folderId
            };

            const file = await FileService.createFile(req.user.userId, fileData);
            
            if (folderId) {
                await SyncService.markFolderForSync(req.user.userId, folderId);
            }
            
            res.status(201).json(file);
        } catch (error) {
            console.error('Szczegóły błędu uploadu:', error);
            res.status(500).json({
                error: 'Błąd przesyłania pliku',
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
                return res.status(400).json({ error: 'Brak przesyłanych plików' });
            }

            const folderId = req.body.folder && mongoose.isValidObjectId(req.body.folder) 
                ? req.body.folder 
                : null;

            const filesData = req.files.map(file => ({
                filePath: file.path,
                originalName: file.originalname,
                mimetype: file.mimetype,
                folderId: folderId
            }));

            const results = await FileService.createMultipleFiles(req.user.userId, filesData, folderId);
            
            // Sprawdź czy wszystkie pliki zostały pomyślnie utworzone
            const successfulFiles = results.filter(result => result.success).map(result => result.file);
            const failedFiles = results.filter(result => !result.success);

            if (folderId && successfulFiles.length > 0) {
                await SyncService.markFolderForSync(req.user.userId, folderId);
            }

            res.status(201).json({
                successful: successfulFiles,
                failed: failedFiles,
                total: req.files.length,
                successCount: successfulFiles.length,
                failureCount: failedFiles.length
            });
        } catch (error) {
            console.error('Błąd przesyłania wielu plików:', error);
            res.status(500).json({
                error: 'Błąd przesyłania plików',
                details: error.message
            });
        }
    }
];

exports.getUserFiles = async (req, res) => {
    try {
        const options = {
            includeDeleted: req.query.includeDeleted === 'true',
            folderId: req.query.folderId || null,
            category: req.query.category || null,
            clientId: req.query.clientId || null,
            limit: req.query.limit ? parseInt(req.query.limit) : null,
            skip: req.query.skip ? parseInt(req.query.skip) : 0,
            sortBy: req.query.sortBy || 'createdAt',
            sortOrder: req.query.sortOrder === 'asc' ? 1 : -1
        };

        const files = await FileService.getUserFiles(req.user.userId, options);
        res.json(files);
    } catch (error) {
        console.error('Błąd pobierania plików:', error);
        res.status(500).json({ error: 'Błąd pobierania plików' });
    }
};

exports.deleteFile = async (req, res) => {
    try {
        const permanent = req.query.permanent === 'true';
        
        const file = await FileService.getFileById(req.user.userId, req.params.id, {
            includeDeleted: permanent
        });
        
        if (!file) {
            return res.status(404).json({ error: 'Plik nie znaleziony' });
        }

        if (permanent && !file.isDeleted) {
            return res.status(400).json({ error: 'Plik musi być najpierw przeniesiony do kosza' });
        }

        const folderId = file.folder;
        const result = await FileService.deleteFile(req.user.userId, req.params.id, permanent);

        if (folderId) {
            await SyncService.markFolderForSync(req.user.userId, folderId);
        }

        res.json(result);
    } catch (error) {
        console.error('Błąd usuwania pliku:', error);
        res.status(500).json({ error: error.message || 'Błąd serwera' });
    }
};

exports.getFileMetadata = async (req, res) => {
    try {
        const metadata = await FileService.getFileMetadata(req.user.userId, req.params.id);
        res.json(metadata);
    } catch (error) {
        console.error('Błąd pobierania metadanych:', error);
        res.status(500).json({ error: error.message || 'Błąd pobierania metadanych' });
    }
};

exports.updateFileMetadata = async (req, res) => {
    try {
        const file = await FileService.getFileById(req.user.userId, req.params.id);
        
        if (!file) {
            return res.status(404).json({ error: 'Plik nie znaleziony' });
        }

        const result = await FileService.updateFileMetadata(req.user.userId, req.params.id, req.body);

        if (file.folder) {
            await SyncService.markFolderForSync(req.user.userId, file.folder);
        }
        
        res.json({ 
            message: 'Metadane zaktualizowane pomyślnie',
            ...result
        });
    } catch (error) {
        console.error('Błąd aktualizacji metadanych:', error);
        res.status(500).json({
            error: error.message || 'Błąd aktualizacji metadanych'
        });
    }
};

exports.restoreFile = async (req, res) => {
    try {
        const file = await FileService.restoreFile(req.user.userId, req.params.id);

        if (file.folder) {
            await SyncService.markFolderForSync(req.user.userId, file.folder);
        }
        
        res.json({ message: 'Plik przywrócony z kosza', file });
    } catch (error) {
        console.error('Błąd przywracania pliku:', error);
        res.status(500).json({ error: error.message || 'Błąd przywracania pliku' });
    }
};

exports.getDeletedFiles = async (req, res) => {
    try {
        const deletedFiles = await FileService.getDeletedFiles(req.user.userId);
        res.json(deletedFiles);
    } catch (error) {
        console.error('Błąd pobierania usuniętych plików:', error);
        res.status(500).json({ error: 'Błąd pobierania usuniętych plików' });
    }
};

exports.emptyTrash = async (req, res) => {
    try {
        const result = await FileService.emptyTrash(req.user.userId);
        res.json(result);
    } catch (error) {
        console.error('Błąd opróżniania kosza:', error);
        res.status(500).json({ error: 'Błąd opróżniania kosza' });
    }
};

exports.checkFileIntegrity = async (req, res) => {
    try {
        const result = await FileService.checkFileIntegrity(req.user.userId, req.params.id);
        res.json(result);
    } catch (error) {
        console.error('Błąd sprawdzania integralności pliku:', error);
        res.status(500).json({ error: error.message || 'Błąd sprawdzania integralności pliku' });
    }
};

exports.updateFileHash = async (req, res) => {
    try {
        const result = await FileService.updateFileHash(req.user.userId, req.params.id);
        
        res.json({
            message: 'Hash pliku zaktualizowany',
            ...result
        });
    } catch (error) {
        console.error('Błąd aktualizacji hash pliku:', error);
        res.status(500).json({ error: error.message || 'Błąd aktualizacji hash pliku' });
    }
};

exports.renameFile = async (req, res) => {
    try {
        const { newName } = req.body;

        if (!newName || newName.trim() === '') {
            return res.status(400).json({ error: 'Nazwa pliku nie może być pusta' });
        }

        const file = await FileService.renameFile(req.user.userId, req.params.id, newName.trim());
        
        res.status(200).json(file);
    } catch (error) {
        console.error('Błąd zmiany nazwy pliku:', error);
        res.status(500).json({ error: error.message || 'Błąd zmiany nazwy pliku' });
    }
};