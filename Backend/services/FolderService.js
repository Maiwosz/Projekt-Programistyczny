const mongoose = require('mongoose');
const Folder = require('../models/Folder');
const File = require('../models/File');
const SyncService = require('./SyncService');
const path = require('path');
const fs = require('fs').promises;

class FolderService {
    
    async createFolder(userId, folderData) {
        const { name, description, parent } = folderData;
        
        if (!name || name.trim() === '') {
            throw new Error('Nazwa folderu jest wymagana');
        }
        
        // Walidacja folderu nadrzędnego
        if (parent) {
            const parentFolder = await this.getFolderById(userId, parent);
            if (!parentFolder) {
                throw new Error('Folder nadrzędny nie istnieje');
            }
        }
        
        // Sprawdź czy folder o takiej nazwie już istnieje w tym samym katalogu
        const existingFolder = await Folder.findOne({
            user: userId,
            name: name.trim(),
            parent: parent || null
        });
        
        if (existingFolder) {
            throw new Error('Folder o takiej nazwie już istnieje w tym katalogu');
        }
        
        const folder = new Folder({
            user: userId,
            name: name.trim(),
            description: description?.trim() || '',
            parent: parent || null
        });
        
        await folder.save();
        
        // Oznacz folder jako potencjalnie wymagający synchronizacji
        try {
            await SyncService.markFolderForSync(userId, folder._id);
        } catch (error) {
            console.warn('Błąd oznaczania folderu do synchronizacji:', error.message);
        }
        
        return folder;
    }
    
    async getFolderById(userId, folderId, options = {}) {
        if (!mongoose.Types.ObjectId.isValid(folderId)) {
            return null;
        }
        
        const query = { _id: folderId, user: userId };
        
        let folder = Folder.findOne(query);
        
        if (options.populate) {
            if (options.populate.includes('parent')) {
                folder = folder.populate('parent', 'name parent');
            }
            if (options.populate.includes('children')) {
                folder = folder.populate({
                    path: 'children',
                    match: { user: userId },
                    select: 'name description createdAt'
                });
            }
        }
        
        return await folder.exec();
    }
    
    async getUserFolders(userId, options = {}) {
        const query = { user: userId };
        
        // Filtrowanie po folderze nadrzędnym
        if (options.parent !== undefined) {
            query.parent = options.parent;
        }
        
        // Filtrowanie po nazwie (wyszukiwanie)
        if (options.search) {
            query.name = { $regex: options.search, $options: 'i' };
        }
        
        let folders = Folder.find(query);
        
        // Sortowanie
        const sortBy = options.sortBy || 'name';
        const sortOrder = options.sortOrder === 'desc' ? -1 : 1;
        folders = folders.sort({ [sortBy]: sortOrder });
        
        // Paginacja
        if (options.limit) {
            folders = folders.limit(parseInt(options.limit));
        }
        if (options.skip) {
            folders = folders.skip(parseInt(options.skip));
        }
        
        // Populacja
        if (options.populate) {
            if (options.populate.includes('parent')) {
                folders = folders.populate('parent', 'name');
            }
        }
        
        return await folders.exec();
    }
    
    async renameFolder(userId, folderId, newName) {
        const folder = await this.getFolderById(userId, folderId);
        if (!folder) {
            throw new Error('Folder nie znaleziony');
        }
        
        if (!newName || newName.trim() === '') {
            throw new Error('Nazwa folderu nie może być pusta');
        }
        
        // Sprawdź czy folder o takiej nazwie już istnieje (z wyjątkiem aktualnego)
        const existingFolder = await Folder.findOne({
            user: userId,
            name: newName.trim(),
            parent: folder.parent,
            _id: { $ne: folderId }
        });
        
        if (existingFolder) {
            throw new Error('Folder o takiej nazwie już istnieje w tym katalogu');
        }
        
        folder.name = newName.trim();
        folder.updatedAt = new Date();
        await folder.save();
        
        // Oznacz folder jako wymagający synchronizacji
        try {
            await SyncService.markFolderForSync(userId, folderId);
        } catch (error) {
            console.warn('Błąd oznaczania folderu do synchronizacji:', error.message);
        }
        
        return folder;
    }
    
    async deleteFolder(userId, folderId, options = {}) {
        const { force = false, permanent = false } = options;
        
        const folder = await this.getFolderById(userId, folderId);
        if (!folder) {
            throw new Error('Folder nie znaleziony');
        }
        
        // Sprawdź czy folder jest pusty (jeśli nie force)
        if (!force) {
            const [filesCount, subfoldersCount] = await Promise.all([
                File.countDocuments({ folder: folderId, user: userId, isDeleted: { $ne: true } }),
                Folder.countDocuments({ parent: folderId, user: userId })
            ]);
            
            if (filesCount > 0 || subfoldersCount > 0) {
                throw new Error('Folder nie jest pusty. Użyj opcji force=true, aby usunąć rekurencyjnie.');
            }
        }
        
        // Usuń synchronizację folderu
        try {
            await SyncService.removeSyncFolder(userId, folderId);
        } catch (error) {
            console.warn('Błąd usuwania synchronizacji folderu:', error.message);
        }
        
        if (force) {
            // Rekurencyjne usuwanie
            await this.deleteFolderRecursive(userId, folderId, permanent);
            return { 
                success: true, 
                message: 'Folder i jego zawartość zostały usunięte',
                permanent 
            };
        } else {
            // Usuń tylko pusty folder
            await Folder.findByIdAndDelete(folderId);
            return { 
                success: true, 
                message: 'Folder został usunięty',
                permanent: true 
            };
        }
    }
    
    async deleteFolderRecursive(userId, folderId, permanent = false) {
		// Usuń podfoldery rekurencyjnie
		const subfolders = await Folder.find({ parent: folderId, user: userId });
		for (const subfolder of subfolders) {
			await this.deleteFolderRecursive(userId, subfolder._id, permanent);
		}
		
		// Usuń pliki w folderze - oznacz do synchronizacji przed usunięciem
		const files = await File.find({ folder: folderId, user: userId });
		for (const file of files) {
			// Oznacz do synchronizacji
			try {
				await SyncService.markFileForSync(userId, file._id, 'deleted');
			} catch (error) {
				console.warn('Błąd oznaczania pliku do synchronizacji:', error.message);
			}
			
			// Usuń plik fizyczny
			if (file.path) {
				const filePath = path.join(__dirname, '../../../uploads', file.path);
				try {
					await fs.unlink(filePath);
				} catch (err) {
					if (err.code !== 'ENOENT') {
						console.warn(`Błąd usuwania pliku ${filePath}:`, err.message);
					}
				}
			}
			
			// Usuń rekord z bazy danych
			await File.findByIdAndDelete(file._id);
		}
		
		// Usuń synchronizację folderu na końcu
		try {
			await SyncService.removeSyncFolder(userId, folderId);
		} catch (error) {
			console.warn('Błąd usuwania synchronizacji folderu:', error.message);
		}
		
		// Usuń folder
		await Folder.findByIdAndDelete(folderId);
	}
    
    async getFolderContents(userId, folderId = null, options = {}) {
        const { 
            includeFiles = true, 
            includeSubfolders = true,
            sortBy = 'name',
            sortOrder = 'asc',
            search,
            fileTypes
        } = options;
        
        const results = {};
        
        if (includeFiles) {
            const fileQuery = {
                user: userId,
                folder: folderId,
                isDeleted: { $ne: true }
            };
            
            // Filtrowanie po typach plików
            if (fileTypes && Array.isArray(fileTypes)) {
                fileQuery.category = { $in: fileTypes };
            }
            
            // Wyszukiwanie w nazwach plików
            if (search) {
                fileQuery.originalName = { $regex: search, $options: 'i' };
            }
            
            let filesQuery = File.find(fileQuery);
            
            // Sortowanie plików
            const fileSortOrder = sortOrder === 'desc' ? -1 : 1;
            if (sortBy === 'size') {
                filesQuery = filesQuery.sort({ size: fileSortOrder });
            } else if (sortBy === 'modified') {
                filesQuery = filesQuery.sort({ lastModified: fileSortOrder });
            } else if (sortBy === 'created') {
                filesQuery = filesQuery.sort({ createdAt: fileSortOrder });
            } else {
                filesQuery = filesQuery.sort({ originalName: fileSortOrder });
            }
            
            results.files = await filesQuery.exec();
        }
        
        if (includeSubfolders) {
            const folderQuery = {
                user: userId,
                parent: folderId
            };
            
            // Wyszukiwanie w nazwach folderów
            if (search) {
                folderQuery.name = { $regex: search, $options: 'i' };
            }
            
            let foldersQuery = Folder.find(folderQuery);
            
            // Sortowanie folderów
            const folderSortOrder = sortOrder === 'desc' ? -1 : 1;
            if (sortBy === 'created') {
                foldersQuery = foldersQuery.sort({ createdAt: folderSortOrder });
            } else if (sortBy === 'modified') {
                foldersQuery = foldersQuery.sort({ updatedAt: folderSortOrder });
            } else {
                foldersQuery = foldersQuery.sort({ name: folderSortOrder });
            }
            
            results.subfolders = await foldersQuery.exec();
        }
        
        return results;
    }
}

module.exports = new FolderService();