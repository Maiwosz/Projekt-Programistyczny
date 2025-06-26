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
                folderId: folderId,
                duplicateAction: req.body.duplicateAction // 'overwrite', 'rename', 'cancel'
            };

            const file = await FileService.createFile(req.user.userId, fileData);
            
            if (folderId) {
                await SyncService.markFolderForSync(req.user.userId, folderId);
            }
            
            res.status(201).json(file);
        } catch (error) {
            console.error('Szczegóły błędu uploadu:', error);
            
            // NAPRAWIONA obsługa błędu duplikatu
            if (error.message === 'DUPLICATE_FILE' && error.existingFile) {
                return res.status(409).json({
                    error: 'DUPLICATE_FILE',
                    message: 'Plik o tej nazwie już istnieje',
                    existingFile: error.existingFile,
                    suggestedName: error.suggestedName,
                    actions: ['overwrite', 'rename', 'cancel']
                });
            }
            
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
            
            // NAPRAWIONA obsługa błędu wielu duplikatów
            if (error.message === 'MULTIPLE_DUPLICATES' && error.duplicates) {
                return res.status(409).json({
                    error: 'MULTIPLE_DUPLICATES',
                    message: 'Niektóre pliki już istnieją',
                    duplicates: error.duplicates,
                    actions: ['overwrite', 'rename', 'cancel']
                });
            }
            
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

exports.handleDuplicates = async (req, res) => {
    try {
        const { files, action, folderId } = req.body; // files: [{ tempPath, originalName, mimetype, newName? }]
        
        const results = [];
        
        for (const fileInfo of files) {
            try {
                const fileData = {
                    filePath: fileInfo.tempPath,
                    originalName: action === 'rename' && fileInfo.newName ? fileInfo.newName : fileInfo.originalName,
                    mimetype: fileInfo.mimetype,
                    folderId: folderId,
                    duplicateAction: action
                };
                
                const file = await FileService.createFile(req.user.userId, fileData);
                results.push({ success: true, file, originalName: fileInfo.originalName });
            } catch (error) {
                results.push({ 
                    success: false, 
                    error: error.message,
                    originalName: fileInfo.originalName
                });
            }
        }
        
        if (folderId) {
            const successfulFiles = results.filter(r => r.success);
            if (successfulFiles.length > 0) {
                await SyncService.markFolderForSync(req.user.userId, folderId);
            }
        }
        
        res.json({
            results,
            successCount: results.filter(r => r.success).length,
            failureCount: results.filter(r => !r.success).length
        });
    } catch (error) {
        console.error('Błąd obsługi duplikatów:', error);
        res.status(500).json({
            error: 'Błąd obsługi duplikatów',
            details: error.message
        });
    }
};

exports.downloadFile = async (req, res) => {
    try {
        const { asBase64 } = req.query;
        const userId = req.user.userId;
        const fileId = req.params.id;

        const result = await FileService.downloadFile(userId, fileId, {
            asBase64: asBase64 === 'true'
        });

        if (result.content) {
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

        const userId = req.user.userId;

        const results = await FileService.downloadMultipleFiles(userId, fileIds, {
            asBase64: asBase64 === true || asBase64 === 'true'
        });

        res.json({ results });
    } catch (error) {
        console.error('Błąd pobierania wielu plików:', error);
        res.status(500).json({ error: error.message || 'Błąd pobierania plików' });
    }
};