const File = require('../models/File');
const path = require('path');
const fs = require('fs');
const exifr = require('exifr');
const { exiftool } = require('exiftool-vendored');
const mongoose = require('mongoose');
const { generateFileHash, getFileStats, getCategoryFromMimeType } = require('../utils/fileUtils');
const SyncService = require('./SyncService');

class FileService {
    
    // === TWORZENIE PLIKÓW ===
    
    async createFile(userId, fileData, options = {}) {
		const {
			filePath,
			originalName,
			mimetype,
			folderId = null,
			content = null,
			hash = null,
			lastModified = null,
			duplicateAction = null // 'overwrite', 'rename', 'cancel'
		} = fileData;
		
		const category = getCategoryFromMimeType(mimetype);
		
		// Sprawdź duplikaty
		const duplicateCheck = await this._checkForDuplicates(userId, originalName, folderId);
		
		if (duplicateCheck.hasDuplicate) {
			if (duplicateCheck.isDeleted) {
				// Istniejący plik jest usunięty - przywróć go i nadpisz
				return await this._restoreAndOverwriteFile(duplicateCheck.existingFile, fileData);
			} else {
				// Plik istnieje i nie jest usunięty
				if (!duplicateAction) {
					// Tworzymy błąd z dodatkowymi właściwościami
					const error = new Error('DUPLICATE_FILE');
					error.existingFile = duplicateCheck.existingFile;
					error.suggestedName = this._generateUniqueName(originalName, duplicateCheck.existingNames);
					throw error;
				}
				
				switch (duplicateAction) {
					case 'overwrite':
						return await this._overwriteExistingFile(duplicateCheck.existingFile, fileData);
					case 'rename':
						fileData.originalName = this._generateUniqueName(originalName, duplicateCheck.existingNames);
						break;
					case 'cancel':
						throw new Error('Operacja anulowana przez użytkownika');
					default:
						throw new Error('Nieprawidłowa akcja dla duplikatu');
				}
			}
		}
		
		// Kontynuuj normalnie jeśli brak duplikatów lub została wybrana opcja rename
		let finalFilePath = filePath;
		let fileHash = hash;
		let fileStats = null;
		
		if (content !== null && !filePath) {
			finalFilePath = await this._saveBase64Content(content, fileData.originalName, category);
		}
		
		if (finalFilePath) {
			fileHash = fileHash || await generateFileHash(finalFilePath);
			fileStats = await getFileStats(finalFilePath);
		}
		
		const metadata = finalFilePath ? await this._processMetadata(finalFilePath) : {};
		
		let filePath_normalized = null;
		if (finalFilePath) {
			filePath_normalized = path.join(category, path.basename(finalFilePath)).replace(/\\/g, '/');
		}
		
		const file = new File({
			user: userId,
			path: filePath_normalized,
			originalName: fileData.originalName, // Używaj zaktualizowanej nazwy (może być zmieniona przez rename)
			mimetype,
			size: fileStats?.size || 0,
			category,
			folder: folderId && mongoose.isValidObjectId(folderId) ? folderId : null,
			metadata,
			fileHash,
			lastModified: lastModified ? new Date(lastModified) : fileStats?.lastModified || new Date(),
			isDeleted: false
		});
		
		await file.save();
		
		if (folderId) {
			await this._markForSync(userId, file._id, 'added');
		}

		return file;
	}
    
    async createMultipleFiles(userId, filesData, folderId = null) {
		const results = [];
		const duplicateInfo = [];
		
		// Sprawdź duplikaty dla wszystkich plików
		for (const fileData of filesData) {
			try {
				const duplicateCheck = await this._checkForDuplicates(userId, fileData.originalName, folderId);
				
				if (duplicateCheck.hasDuplicate && !duplicateCheck.isDeleted) {
					duplicateInfo.push({
						originalName: fileData.originalName,
						existingFile: duplicateCheck.existingFile,
						suggestedName: this._generateUniqueName(fileData.originalName, duplicateCheck.existingNames)
					});
				}
			} catch (error) {
				results.push({ 
					success: false, 
					error: error.message,
					fileName: fileData.originalName 
				});
			}
		}
		
		// Jeśli są duplikaty, zwróć specjalny błąd
		if (duplicateInfo.length > 0) {
			const error = new Error('MULTIPLE_DUPLICATES');
			error.duplicates = duplicateInfo;  // Dodaj dane do obiektu błędu
			throw error;
		}
		
		// Przetwórz pliki normalnie jeśli brak duplikatów
		for (const fileData of filesData) {
			try {
				const file = await this.createFile(userId, { ...fileData, folderId });
				results.push({ success: true, file });
			} catch (error) {
				results.push({ 
					success: false, 
					error: error.message,
					fileName: fileData.originalName 
				});
			}
		}
		
		return results;
	}
    
    // === POBIERANIE PLIKÓW ===
    
    async getUserFiles(userId, options = {}) {
        const {
            includeDeleted = false,
            folderId = null,
            category = null,
            limit = null,
            skip = 0,
            sortBy = 'createdAt',
            sortOrder = -1
        } = options;
        
        const filter = { user: userId };
        
        if (!includeDeleted) filter.isDeleted = { $ne: true };
        if (folderId) filter.folder = folderId;
        if (category) filter.category = category;
        
        let query = File.find(filter)
            .populate('folder', 'name description')
            .sort({ [sortBy]: sortOrder });
            
        if (skip > 0) query = query.skip(skip);
        if (limit) query = query.limit(limit);
        
        return await query.exec();
    }
    
    async getFileById(userId, fileId, options = {}) {
        const { includeDeleted = false } = options;
        
        const filter = { _id: fileId, user: userId };
        if (!includeDeleted) filter.isDeleted = { $ne: true };
        
        return await File.findOne(filter)
            .populate('folder', 'name description')
            .exec();
    }
    
    async getDeletedFiles(userId) {
        return await File.find({ 
            user: userId,
            isDeleted: true
        })
        .populate('folder', 'name')
        .sort({ deletedAt: -1 });
    }
    
    async downloadFile(userId, fileId, options = {}) {
        const file = await this.getFileById(userId, fileId);
        if (!file?.path) {
            throw new Error('Plik nie znaleziony lub brak ścieżki');
        }
        
        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            
            if (options.asBase64) {
                const buffer = await fs.promises.readFile(filePath);
                return {
                    file,
                    content: buffer.toString('base64'),
                    contentType: file.mimetype
                };
            }
            
            return { file, filePath, contentType: file.mimetype };
            
        } catch (err) {
            throw new Error('Plik nie istnieje na serwerze');
        }
    }

    async downloadMultipleFiles(userId, fileIds, options = {}) {
        const results = [];
        
        for (const fileId of fileIds) {
            try {
                const result = await this.downloadFile(userId, fileId, options);
                results.push({ success: true, fileId, ...result });
            } catch (error) {
                results.push({ success: false, fileId, error: error.message });
            }
        }
        
        return results;
    }
    
    // === AKTUALIZACJA PLIKÓW ===
    
    async renameFile(userId, fileId, newName) {
        const file = await this.getFileById(userId, fileId);
        if (!file) throw new Error('Plik nie znaleziony');
        
        file.originalName = newName;
        await file.save();
        
        if (file.folder) {
            await this._markForSync(userId, fileId, 'modified');
        }
        
        return file;
    }
    
    // === USUWANIE PLIKÓW ===
    
    async deleteFile(userId, fileId, permanent = false) {
		const file = await File.findOne({ 
			_id: fileId, 
			user: userId,
			isDeleted: permanent ? true : { $ne: true }
		});
		
		if (!file) throw new Error('Plik nie znaleziony');
		
		if (permanent) {
			// Oznacz do synchronizacji PRZED trwałym usunięciem
			if (file.folder) {
				await this._markForSync(userId, fileId, 'deleted');
			}
			
			if (file.path) {
				const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
				await this._deletePhysicalFile(filePath);
			}
			
			await File.findByIdAndDelete(fileId);
			return { message: 'Plik trwale usunięty', permanent: true };
		} else {
			file.isDeleted = true;
			file.deletedAt = new Date();
			file.deletedBy = 'user';
			await file.save();
			
			// Oznacz jako usunięty PO soft delete
			if (file.folder) {
				await this._markFileAsDeleted(userId, fileId);
			}
			
			return { message: 'Plik przeniesiony do kosza', permanent: false };
		}
	}
    
    async restoreFile(userId, fileId) {
		const file = await File.findOne({ 
			_id: fileId, 
			user: userId,
			isDeleted: true
		});
		
		if (!file) throw new Error('Plik nie znaleziony w koszu');
		
		file.isDeleted = false;
		file.deletedAt = null;
		file.deletedBy = null;
		file.restoredFromTrash = true;
		file.restoredAt = new Date();
		await file.save();
		
		// POPRAWKA: Oznacz przywrócony plik do synchronizacji
		if (file.folder) {
			await this._markForSync(userId, fileId, 'added');
		}
		
		return file;
	}
	
    async emptyTrash(userId) {
        const deletedFiles = await File.find({ user: userId, isDeleted: true });
        
        // Usuń fizyczne pliki
        for (const file of deletedFiles) {
            if (file.path) {
                const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
                await this._deletePhysicalFile(filePath);
            }
        }
        
        const result = await File.deleteMany({ user: userId, isDeleted: true });
        
        return { 
            message: 'Kosz został oprożniony',
            deletedCount: result.deletedCount
        };
    }
    
    // === METADANE I INTEGRALNOŚĆ ===
    
    async getFileMetadata(userId, fileId) {
        const file = await File.findOne({ 
            _id: fileId, 
            user: userId,
            isDeleted: { $ne: true }
        })
        .select('originalName mimetype category createdAt metadata path fileHash lastModified size clientMappings')
        .lean();
        
        if (!file) throw new Error('Plik nie znaleziony');
        
        // Dodaj aktualne informacje o pliku
        if (file.path) {
            const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
            try {
                const stats = await fs.promises.stat(filePath);
                file.currentSize = stats.size;
                file.currentLastModified = stats.mtime;
                file.fileExists = true;
            } catch (err) {
                file.currentSize = 0;
                file.currentLastModified = null;
                file.fileExists = false;
            }
        }
        
        return file;
    }
    
    async updateFileMetadata(userId, fileId, newMetadata) {
        const file = await this.getFileById(userId, fileId);
        if (!file) throw new Error('Plik nie znaleziony');
        if (!file.mimetype.startsWith('image/')) {
            throw new Error('Metadane dostępne tylko dla obrazów');
        }
        
        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            await exiftool.write(filePath, newMetadata);
            
            const updatedMetadata = await exiftool.read(filePath);
            const newFileHash = await generateFileHash(filePath);
            const fileStats = await getFileStats(filePath);
            
            file.metadata = updatedMetadata;
            file.fileHash = newFileHash;
            file.lastModified = fileStats.lastModified;
            await file.save();
            
            return {
                metadata: updatedMetadata,
                fileHash: newFileHash,
                lastModified: fileStats.lastModified
            };
        } catch (error) {
            throw new Error(`Nie udało się zaktualizować metadanych pliku: ${error.message}`);
        }
    }
    
    async checkFileIntegrity(userId, fileId) {
        const file = await this.getFileById(userId, fileId);
        if (!file) throw new Error('Plik nie znaleziony');
        if (!file.path) {
            return { fileExists: false, hashMatch: false, error: 'Brak ścieżki do pliku' };
        }
        
        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            const currentHash = await generateFileHash(filePath);
            const fileStats = await getFileStats(filePath);
            
            const hashMatch = currentHash === file.fileHash;
            const isModified = file.lastModified && 
                new Date(fileStats.lastModified).getTime() !== new Date(file.lastModified).getTime();
            
            return {
                fileExists: true,
                hashMatch,
                isModified,
                storedHash: file.fileHash,
                currentHash,
                storedLastModified: file.lastModified,
                currentLastModified: fileStats.lastModified,
                currentSize: fileStats.size
            };
        } catch (err) {
            return { fileExists: false, hashMatch: false, error: 'Plik nie istnieje na dysku' };
        }
    }
    
    async updateFileHash(userId, fileId) {
        const file = await this.getFileById(userId, fileId);
        if (!file?.path) throw new Error('Plik nie znaleziony lub brak ścieżki');
        
        const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
        
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            const newHash = await generateFileHash(filePath);
            const fileStats = await getFileStats(filePath);
            
            file.fileHash = newHash;
            file.lastModified = fileStats.lastModified;
            file.size = fileStats.size;
            await file.save();
            
            return {
                fileHash: newHash,
                lastModified: fileStats.lastModified,
                size: fileStats.size
            };
        } catch (err) {
            throw new Error('Plik nie istnieje na serwerze');
        }
    }
    
    // === METODY PRYWATNE ===
    
    async _saveBase64Content(content, originalName, category) {
		const uploadDir = path.resolve(process.env.UPLOADS_DIR, category);
		if (!fs.existsSync(uploadDir)) {
			fs.mkdirSync(uploadDir, { recursive: true });
		}
		
		const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(originalName);
		const filePath = path.join(uploadDir, uniqueName);
		
		try {
			// POPRAWKA: Obsłuż pusty content gracefully
			const buffer = content ? Buffer.from(content, 'base64') : Buffer.alloc(0);
			fs.writeFileSync(filePath, buffer);
			return filePath;
		} catch (error) {
			throw new Error('Błąd zapisywania pliku: ' + error.message);
		}
	}
    
    async _processMetadata(filePath) {
        try {
            const metadata = await exifr.parse(filePath, {
                iptc: true,
                xmp: true,
                icc: true,
                maxBufferSize: 30 * 1024 * 1024
            });
            
            return metadata || await exiftool.read(filePath);
        } catch (error) {
            console.error('Błąd przetwarzania metadanych:', error);
            return {};
        }
    }
    
    async _deletePhysicalFile(filePath) {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            await fs.promises.unlink(filePath);
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.warn('Błąd usuwania pliku z dysku:', err);
            }
        }
    }
    
    async _markForSync(userId, fileId, operation) {
        try {
            await SyncService.markFileForSync(userId, fileId, operation);
        } catch (error) {
            console.warn('Błąd oznaczania do synchronizacji:', error.message);
        }
    }
	
	async _markFileAsDeleted(userId, fileId) {
		try {
			await SyncService.markFileAsDeleted(userId, fileId);
		} catch (error) {
			console.warn('Błąd oznaczania jako usunięty do synchronizacji:', error.message);
		}
	}
	
	async _checkForDuplicates(userId, originalName, folderId) {
		const existingFiles = await File.find({
			user: userId,
			originalName: originalName,
			folder: folderId
		}).sort({ createdAt: -1 });
		
		if (existingFiles.length === 0) {
			return { hasDuplicate: false };
		}
		
		// POPRAWKA: Znajdź tylko pierwszy aktywny i pierwszy usunięty plik
		const activeFile = existingFiles.find(f => !f.isDeleted);
		const deletedFile = existingFiles.find(f => f.isDeleted);
		
		if (activeFile) {
			// Pobierz wszystkie nazwy w folderze dla generowania unikalnej nazwy
			const allFiles = await File.find({
				user: userId,
				folder: folderId,
				isDeleted: { $ne: true }
			}).select('originalName');
			
			return {
				hasDuplicate: true,
				isDeleted: false,
				existingFile: activeFile,
				existingNames: allFiles.map(f => f.originalName)
			};
		} else if (deletedFile) {
			return {
				hasDuplicate: true,
				isDeleted: true,
				existingFile: deletedFile
			};
		}
		
		return { hasDuplicate: false };
	}

	async _restoreAndOverwriteFile(existingFile, newFileData) {
		const category = getCategoryFromMimeType(newFileData.mimetype);
		let finalFilePath = newFileData.filePath;
		
		// Usuń stary plik fizyczny jeśli istnieje
		if (existingFile.path) {
			const oldFilePath = path.resolve(process.env.UPLOADS_DIR, existingFile.path);
			await this._deletePhysicalFile(oldFilePath);
		}
		
		// Zapisz nowy plik
		if (newFileData.content !== null && !newFileData.filePath) {
			finalFilePath = await this._saveBase64Content(newFileData.content, newFileData.originalName, category);
		}
		
		const fileHash = await generateFileHash(finalFilePath);
		const fileStats = await getFileStats(finalFilePath);
		const metadata = await this._processMetadata(finalFilePath);
		
		// Aktualizuj istniejący rekord
		existingFile.path = path.join(category, path.basename(finalFilePath)).replace(/\\/g, '/');
		existingFile.mimetype = newFileData.mimetype;
		existingFile.size = fileStats.size;
		existingFile.category = category;
		existingFile.metadata = metadata;
		existingFile.fileHash = fileHash;
		existingFile.lastModified = fileStats.lastModified;
		existingFile.isDeleted = false;
		existingFile.deletedAt = null;
		existingFile.restoredFromTrash = true;
		existingFile.restoredAt = new Date();
		
		await existingFile.save();
		
		// POPRAWKA: Oznacz jako przywrócony z kosza zamiast zmodyfikowany
		if (existingFile.folder) {
			await this._markForSync(existingFile.user, existingFile._id, 'added');
		}
		
		return existingFile;
	}

	async _overwriteExistingFile(existingFile, newFileData) {
		const category = getCategoryFromMimeType(newFileData.mimetype);
		let finalFilePath = newFileData.filePath;
		
		// Usuń stary plik fizyczny
		if (existingFile.path) {
			const oldFilePath = path.resolve(process.env.UPLOADS_DIR, existingFile.path);
			await this._deletePhysicalFile(oldFilePath);
		}
		
		// Zapisz nowy plik
		if (newFileData.content !== null && !newFileData.filePath) {
			finalFilePath = await this._saveBase64Content(newFileData.content, newFileData.originalName, category);
		}
		
		const fileHash = await generateFileHash(finalFilePath);
		const fileStats = await getFileStats(finalFilePath);
		const metadata = await this._processMetadata(finalFilePath);
		
		// Aktualizuj istniejący rekord
		existingFile.path = path.join(category, path.basename(finalFilePath)).replace(/\\/g, '/');
		existingFile.mimetype = newFileData.mimetype;
		existingFile.size = fileStats.size;
		existingFile.category = category;
		existingFile.metadata = metadata;
		existingFile.fileHash = fileHash;
		existingFile.lastModified = fileStats.lastModified;
		
		await existingFile.save();
		
		if (existingFile.folder) {
			await this._markForSync(existingFile.user, existingFile._id, 'modified');
		}
		
		return existingFile;
	}

	_generateUniqueName(originalName, existingNames) {
		const ext = path.extname(originalName);
		const baseName = path.basename(originalName, ext);
		
		let counter = 1;
		let newName = originalName;
		
		while (existingNames.includes(newName)) {
			newName = `${baseName} (${counter})${ext}`;
			counter++;
		}
		
		return newName;
	}
}

module.exports = new FileService();