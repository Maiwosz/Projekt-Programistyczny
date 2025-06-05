const File = require('../models/File');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');
const { exiftool } = require('exiftool-vendored');
const mongoose = require('mongoose');
const { generateFileHash, getFileStats, getCategoryFromMimeType } = require('../utils/fileUtils');
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
            const filePath = req.file.path;
            const metadata = await processMetadata(filePath);
            const fileHash = await generateFileHash(filePath);
            const fileStats = await getFileStats(filePath);
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
                fileHash: fileHash,
                lastModified: fileStats.lastModified,
                isDeleted: false
            });
            
            await file.save();
            
            if (folderId) {
                await SyncService.markFolderForSync(req.user.userId, folderId);
            }
            
            res.status(201).json(file);
        } catch (error) {
            console.error('Szczegï¿½y bï¿½ï¿½du uploadu:', error);
            res.status(500).json({
                error: 'Bï¿½ï¿½d przesyï¿½ania pliku',
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
                return res.status(400).json({ error: 'Brak przesï¿½anych plikï¿½w' });
            }

            const files = await Promise.all(
                req.files.map(async (file) => {
                    const category = getCategoryFromMimeType(file.mimetype);
                    const filePath = file.path;
                    const metadata = await processMetadata(filePath);
                    const fileHash = await generateFileHash(filePath);
                    const fileStats = await getFileStats(filePath);
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
                        metadata: metadata,
                        fileHash: fileHash,
                        lastModified: fileStats.lastModified,
                        isDeleted: false
                    });
                    
                    await newFile.save();
                    return newFile;
                })
            );

            // DODANE: Oznacz folder do synchronizacji jeœli pliki zosta³y dodane do zsynchronizowanego folderu
            const folderId = req.body.folder && mongoose.isValidObjectId(req.body.folder) ? req.body.folder : null;
            if (folderId) {
                await SyncService.markFolderForSync(req.user.userId, folderId);
            }

            res.status(201).json(files);
        } catch (error) {
            console.error('Bï¿½ï¿½d przesyï¿½ania wielu plikï¿½w:', error);
            res.status(500).json({
                error: 'Bï¿½ï¿½d przesyï¿½ania plikï¿½w',
                details: error.message
            });
        }
    }
];

exports.getUserFiles = async (req, res) => {
    try {
        const includeDeleted = req.query.includeDeleted === 'true';
        const filter = { user: req.user.userId };
        
        // ZMIANA: Zawsze wykluczaj usuniï¿½te pliki z gï¿½ï¿½wnego widoku
        filter.isDeleted = { $ne: true };

        const files = await File.find(filter)
            .populate('folder', 'name')
            .sort({ createdAt: -1 });
            
        res.json(files);
    } catch (error) {
        console.error('Bï¿½ï¿½d pobierania plikï¿½w:', error);
        res.status(500).json({ error: 'Bï¿½ï¿½d pobierania plikï¿½w' });
    }
};

exports.deleteFile = async (req, res) => {
    try {
        const { permanent } = req.query;
        let file;
        
        if (permanent === 'true') {
            file = await File.findOne({ 
                _id: req.params.id, 
                user: req.user.userId,
                isDeleted: true
            });
        } else {
            file = await File.findOne({ 
                _id: req.params.id, 
                user: req.user.userId,
                isDeleted: { $ne: true }
            });
        }
        
        if (!file) {
            return res.status(404).json({ error: 'Plik nie znaleziony' });
        }

        const folderId = file.folder; // Zapisz ID folderu przed usuniêciem

        if (permanent === 'true') {
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
            res.json({ message: 'Plik trwale usuniï¿½ty', permanent: true });
        } else {
            file.isDeleted = true;
            file.deletedAt = new Date();
            file.deletedBy = 'user';
            await file.save();
            
            res.json({ message: 'Plik przeniesiony do kosza', permanent: false });
        }

        // DODANE: Oznacz folder do synchronizacji po usuniêciu pliku
        if (folderId) {
            await SyncService.markFolderForSync(req.user.userId, folderId);
        }
    } catch (error) {
        console.error('Bï¿½ï¿½d usuwania pliku:', error);
        res.status(500).json({ error: 'Bï¿½ï¿½d serwera' });
    }
};

exports.restoreFile = async (req, res) => {
    try {
        const file = await File.findOne({ 
            _id: req.params.id, 
            user: req.user.userId,
            isDeleted: true
        });
        
        if (!file) {
            return res.status(404).json({ error: 'Plik nie znaleziony w koszu' });
        }

        file.isDeleted = false;
        file.deletedAt = null;
        file.deletedBy = null;
        file.restoredFromTrash = true;
        file.restoredAt = new Date();
        file.syncedToDrive = false;
        file.lastSyncDate = null;
        await file.save();

        // DODANE: Oznacz folder do synchronizacji po przywróceniu pliku
        if (file.folder) {
            await SyncService.markFolderForSync(req.user.userId, file.folder);
        }
        
        res.json({ message: 'Plik przywrï¿½cony z kosza', file });
    } catch (error) {
        console.error('Bï¿½ï¿½d przywracania pliku:', error);
        res.status(500).json({ error: 'Bï¿½ï¿½d przywracania pliku' });
    }
};

exports.getDeletedFiles = async (req, res) => {
    try {
        const deletedFiles = await File.find({ 
            user: req.user.userId,
            isDeleted: true
        })
        .populate('folder', 'name')
        .sort({ deletedAt: -1 });
        
        res.json(deletedFiles);
    } catch (error) {
        console.error('Bï¿½ï¿½d pobierania usuniï¿½tych plikï¿½w:', error);
        res.status(500).json({ error: 'Bï¿½ï¿½d pobierania usuniï¿½tych plikï¿½w' });
    }
};

exports.emptyTrash = async (req, res) => {
    try {
        const deletedFiles = await File.find({ 
            user: req.user.userId,
            isDeleted: true
        });

        // Usuï¿½ fizyczne pliki z dysku
        for (const file of deletedFiles) {
            const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
            try {
                await fs.promises.access(filePath, fs.constants.F_OK);
                await fs.promises.unlink(filePath);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.warn('Bï¿½ï¿½d usuwania pliku z dysku:', err);
                }
            }
        }

        // Usuï¿½ rekordy z bazy danych
        const result = await File.deleteMany({ 
            user: req.user.userId,
            isDeleted: true
        });

        res.json({ 
            message: 'Kosz zostaï¿½ oprï¿½niony',
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Bï¿½ï¿½d oprï¿½niania kosza:', error);
        res.status(500).json({ error: 'Bï¿½ï¿½d oprï¿½niania kosza' });
    }
};

exports.getFileMetadata = async (req, res) => {
    try {
        const file = await File.findOne({ 
            _id: req.params.id, 
            user: req.user.userId,
            isDeleted: { $ne: true }
        })
        .select('originalName mimetype category createdAt metadata path fileHash lastModified syncedFromDrive syncedToDrive lastSyncDate')
        .lean();

        if (!file) return res.status(404).json({ error: 'Plik nie znaleziony' });

        // Pobierz aktualny rozmiar pliku z systemu plikï¿½w
        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        try {
            const stats = await fs.promises.stat(filePath);
            file.size = stats.size;
            file.currentLastModified = stats.mtime;
        } catch (err) {
            console.warn('Nie moï¿½na odczytaï¿½ rozmiaru pliku:', err);
            file.size = 0;
            file.currentLastModified = null;
        }

        res.json(file);
    } catch (error) {
        console.error('Bï¿½ï¿½d pobierania metadanych:', error);
        res.status(500).json({ error: 'Bï¿½ï¿½d pobierania metadanych' });
    }
};

exports.updateFileMetadata = async (req, res) => {
    try {
        const file = await File.findOne({ 
            _id: req.params.id, 
            user: req.user.userId,
            isDeleted: { $ne: true }
        });
        
        if (!file) return res.status(404).json({ error: 'Plik nie znaleziony' });

        if (!file.mimetype.startsWith('image/')) {
            return res.status(400).json({ error: 'Metadane dostï¿½pne tylko dla obrazï¿½w' });
        }

        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
        } catch (err) {
            return res.status(404).json({ error: 'Plik nie istnieje na serwerze' });
        }

        try {
            console.log('Aktualizacja metadanych pliku:', filePath);
            console.log('Nowe metadane:', req.body);
            
            await exiftool.write(filePath, req.body);
            const updatedMetadata = await exiftool.read(filePath);
            console.log('Zaktualizowane metadane:', updatedMetadata);
            
            const newFileHash = await generateFileHash(filePath);
            const fileStats = await getFileStats(filePath);
            
            file.metadata = updatedMetadata;
            file.fileHash = newFileHash;
            file.lastModified = fileStats.lastModified;
            await file.save();

            // DODANE: Oznacz folder do synchronizacji po aktualizacji metadanych
            if (file.folder) {
                await SyncService.markFolderForSync(req.user.userId, file.folder);
            }
            
            res.json({ 
                message: 'Metadane zaktualizowane pomyï¿½lnie',
                metadata: updatedMetadata,
                fileHash: newFileHash,
                lastModified: fileStats.lastModified
            });
        } catch (error) {
            console.error('Bï¿½ï¿½d podczas aktualizacji metadanych pliku:', error);
            return res.status(500).json({ 
                error: 'Nie udaï¿½o siï¿½ zaktualizowaï¿½ metadanych pliku',
                details: error.message 
            });
        }
    } catch (error) {
        console.error('Szczegï¿½y bï¿½ï¿½du:', error);
        res.status(500).json({
            error: 'Bï¿½ï¿½d aktualizacji metadanych',
            details: error.message
        });
    }
};

exports.checkFileIntegrity = async (req, res) => {
    try {
        const file = await File.findOne({ 
            _id: req.params.id, 
            user: req.user.userId,
            isDeleted: { $ne: true }
        });
        
        if (!file) return res.status(404).json({ error: 'Plik nie znaleziony' });

        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            const currentHash = await generateFileHash(filePath);
            const fileStats = await getFileStats(filePath);
            
            const isIntact = currentHash === file.fileHash;
            const isModified = file.lastModified && 
                new Date(fileStats.lastModified).getTime() !== new Date(file.lastModified).getTime();
            
            res.json({
                fileExists: true,
                hashMatch: isIntact,
                isModified: isModified,
                storedHash: file.fileHash,
                currentHash: currentHash,
                storedLastModified: file.lastModified,
                currentLastModified: fileStats.lastModified
            });
        } catch (err) {
            res.json({
                fileExists: false,
                hashMatch: false,
                error: 'Plik nie istnieje na dysku'
            });
        }
    } catch (error) {
        console.error('Bï¿½ï¿½d sprawdzania integralnoï¿½ci pliku:', error);
        res.status(500).json({ error: 'Bï¿½ï¿½d sprawdzania integralnoï¿½ci pliku' });
    }
};

exports.updateFileHash = async (req, res) => {
    try {
        const file = await File.findOne({ 
            _id: req.params.id, 
            user: req.user.userId,
            isDeleted: { $ne: true }
        });
        
        if (!file) return res.status(404).json({ error: 'Plik nie znaleziony' });

        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            const newHash = await generateFileHash(filePath);
            const fileStats = await getFileStats(filePath);
            
            file.fileHash = newHash;
            file.lastModified = fileStats.lastModified;
            await file.save();
            
            res.json({
                message: 'Hash pliku zaktualizowany',
                fileHash: newHash,
                lastModified: fileStats.lastModified
            });
        } catch (err) {
            return res.status(404).json({ error: 'Plik nie istnieje na serwerze' });
        }
    } catch (error) {
        console.error('Bï¿½ï¿½d aktualizacji hash pliku:', error);
        res.status(500).json({ error: 'Bï¿½ï¿½d aktualizacji hash pliku' });
    }
};

const processMetadata = async (filePath) => {
    try {
        // Najpierw prï¿½bujemy odczytaï¿½ metadane za pomocï¿½ exifr
        const metadata = await exifr.parse(filePath, {
            iptc: true,
            xmp: true,
            icc: true,
            maxBufferSize: 30 * 1024 * 1024
        });
        
        if (metadata) return metadata;
        
        // Jeï¿½li exifr nie zwrï¿½ciï¿½ metadanych, prï¿½bujemy z exiftool
        return await exiftool.read(filePath);
    } catch (error) {
        console.error('Bï¿½ï¿½d przetwarzania metadanych:', error);
        return {};
    }
};

exports.renameFile = async (req, res) => {
    try {
        const { newName } = req.body;

        const file = await File.findOne({ 
            _id: req.params.id
        });

        if (!file) {
            return res.status(404).json({ error: 'Plik nie znaleziony' });
        }

        file.originalName = newName;
        await file.save();
        
        res.status(200).json(file);
    } catch (error) {
        res.status(500).json({ error: 'BÅ‚Ä…d zmiany nazwy pliku' });
    }
};

process.on('exit', () => exiftool.end());
process.on('SIGINT', () => exiftool.end());
process.on('uncaughtException', (err) => {
    exiftool.end();
    process.exit(1);
});