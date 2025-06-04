const File = require('../models/File');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');
const { exiftool } = require('exiftool-vendored');
const mongoose = require('mongoose');
const { generateFileHash, getFileStats, getCategoryFromMimeType } = require('../utils/fileUtils');

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
        const includeDeleted = req.query.includeDeleted === 'true';
        const filter = { user: req.user.userId };
        
        // ZMIANA: Zawsze wykluczaj usuni�te pliki z g��wnego widoku
        filter.isDeleted = { $ne: true };

        const files = await File.find(filter)
            .populate('folder', 'name')
            .sort({ createdAt: -1 });
            
        res.json(files);
    } catch (error) {
        console.error('B��d pobierania plik�w:', error);
        res.status(500).json({ error: 'B��d pobierania plik�w' });
    }
};

exports.deleteFile = async (req, res) => {
    try {
        const { permanent } = req.query;
        let file;
		if (permanent === 'true') {
			// Dla trwa�ego usuwania szukaj w�r�d usuni�tych plik�w
			file = await File.findOne({ 
				_id: req.params.id, 
				user: req.user.userId,
				isDeleted: true
			});
		} else {
			// Dla soft delete szukaj w�r�d aktywnych plik�w
			file = await File.findOne({ 
				_id: req.params.id, 
				user: req.user.userId,
				isDeleted: { $ne: true }
			});
		}
        
        if (!file) {
            return res.status(404).json({ error: 'Plik nie znaleziony' });
        }

        if (permanent === 'true') {
            // Trwa�e usuni�cie - usu� plik z dysku i baz� danych
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
            res.json({ message: 'Plik trwale usuni�ty', permanent: true });
        } else {
            // Soft delete - oznacz jako usuni�ty
            file.isDeleted = true;
            file.deletedAt = new Date();
            file.deletedBy = 'user';
            await file.save();
            
            res.json({ message: 'Plik przeniesiony do kosza', permanent: false });
        }
    } catch (error) {
        console.error('B��d usuwania pliku:', error);
        res.status(500).json({ error: 'B��d serwera' });
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
        
        file.syncedToDrive = false; // B�dzie wymaga� ponownego uploadu
        file.lastSyncDate = null;
        await file.save();
        
        res.json({ message: 'Plik przywr�cony z kosza', file });
    } catch (error) {
        console.error('B��d przywracania pliku:', error);
        res.status(500).json({ error: 'B��d przywracania pliku' });
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
        console.error('B��d pobierania usuni�tych plik�w:', error);
        res.status(500).json({ error: 'B��d pobierania usuni�tych plik�w' });
    }
};

exports.emptyTrash = async (req, res) => {
    try {
        const deletedFiles = await File.find({ 
            user: req.user.userId,
            isDeleted: true
        });

        // Usu� fizyczne pliki z dysku
        for (const file of deletedFiles) {
            const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
            try {
                await fs.promises.access(filePath, fs.constants.F_OK);
                await fs.promises.unlink(filePath);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.warn('B��d usuwania pliku z dysku:', err);
                }
            }
        }

        // Usu� rekordy z bazy danych
        const result = await File.deleteMany({ 
            user: req.user.userId,
            isDeleted: true
        });

        res.json({ 
            message: 'Kosz zosta� opr�niony',
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('B��d opr�niania kosza:', error);
        res.status(500).json({ error: 'B��d opr�niania kosza' });
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

        // Pobierz aktualny rozmiar pliku z systemu plik�w
        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        try {
            const stats = await fs.promises.stat(filePath);
            file.size = stats.size;
            file.currentLastModified = stats.mtime;
        } catch (err) {
            console.warn('Nie mo�na odczyta� rozmiaru pliku:', err);
            file.size = 0;
            file.currentLastModified = null;
        }

        res.json(file);
    } catch (error) {
        console.error('B��d pobierania metadanych:', error);
        res.status(500).json({ error: 'B��d pobierania metadanych' });
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
            return res.status(400).json({ error: 'Metadane dost�pne tylko dla obraz�w' });
        }

        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        
        // Sprawd� czy plik istnieje na dysku
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
        } catch (err) {
            return res.status(404).json({ error: 'Plik nie istnieje na serwerze' });
        }

        try {
            // Aktualizacja metadanych w fizycznym pliku
            console.log('Aktualizacja metadanych pliku:', filePath);
            console.log('Nowe metadane:', req.body);
            
            // U�ywamy exiftool do zapisu metadanych w pliku
            await exiftool.write(filePath, req.body);
            
            // Odczytujemy zaktualizowane metadane
            const updatedMetadata = await exiftool.read(filePath);
            console.log('Zaktualizowane metadane:', updatedMetadata);
            
            // Generuj nowy hash po zmianie metadanych
            const newFileHash = await generateFileHash(filePath);
            const fileStats = await getFileStats(filePath);
            
            // Aktualizujemy rekord w bazie danych
            file.metadata = updatedMetadata;
            file.fileHash = newFileHash;
            file.lastModified = fileStats.lastModified;
            await file.save();
            
            res.json({ 
                message: 'Metadane zaktualizowane pomy�lnie',
                metadata: updatedMetadata,
                fileHash: newFileHash,
                lastModified: fileStats.lastModified
            });
        } catch (error) {
            console.error('B��d podczas aktualizacji metadanych pliku:', error);
            return res.status(500).json({ 
                error: 'Nie uda�o si� zaktualizowa� metadanych pliku',
                details: error.message 
            });
        }
    } catch (error) {
        console.error('Szczeg�y b��du:', error);
        res.status(500).json({
            error: 'B��d aktualizacji metadanych',
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
        console.error('B��d sprawdzania integralno�ci pliku:', error);
        res.status(500).json({ error: 'B��d sprawdzania integralno�ci pliku' });
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
        console.error('B��d aktualizacji hash pliku:', error);
        res.status(500).json({ error: 'B��d aktualizacji hash pliku' });
    }
};

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

exports.renameFile = async (req, res) => {
//6840625b33546af9698b2899
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
        res.status(500).json({ error: 'Błąd zmiany nazwy pliku' });
    }
};

process.on('exit', () => exiftool.end());
process.on('SIGINT', () => exiftool.end());
process.on('uncaughtException', (err) => {
    exiftool.end();
    process.exit(1);
});