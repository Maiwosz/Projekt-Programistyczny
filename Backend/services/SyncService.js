const mongoose = require('mongoose');
const Client = require('../models/Client');
const SyncFolder = require('../models/SyncFolder');
const FileSyncState = require('../models/FileSyncState');
const File = require('../models/File');
const Folder = require('../models/Folder');

/**
 * Agnostyczny serwis synchronizacji - zapewnia interfejs dla wszystkich typów klientów
 */
class SyncService {
    
    // === ZARZĄDZANIE KLIENTAMI ===
    
    async registerClient(userId, { type, name, metadata = {} }) {
        const clientId = this._generateClientId(userId, type);
        
        const client = new Client({
            user: userId,
            clientId,
            type,
            name,
            metadata,
            isActive: true,
            lastSeen: new Date()
        });
        
        await client.save();
        return client;
    }
    
    async getClient(userId, clientId) {
        return await Client.findOne({ 
            user: userId, 
            clientId,
            isActive: true 
        });
    }
    
    async updateClientActivity(userId, clientId) {
        await Client.updateOne(
            { user: userId, clientId },
            { lastSeen: new Date() }
        );
    }
    
    // === KONFIGURACJA SYNCHRONIZACJI FOLDERÓW ===
    
    async addSyncFolder(userId, clientId, clientFolderPath, serverFolderId, clientFolderName = null) {
        const client = await this._getClientOrThrow(userId, clientId);
        const serverFolder = await this._getServerFolderOrThrow(userId, serverFolderId);
        
        let syncFolder = await SyncFolder.findOne({
            user: userId,
            folder: serverFolderId
        });
        
        if (!syncFolder) {
            syncFolder = new SyncFolder({
                user: userId,
                folder: serverFolderId,
                clients: []
            });
        } else {
            this._validateClientNotAlreadySync(syncFolder, client._id);
        }
        
        syncFolder.clients.push({
            client: client._id,
            clientId: clientId,
            clientFolderId: clientFolderPath,
            clientFolderName: clientFolderName || serverFolder.name,
            clientFolderPath: clientFolderPath,
            syncDirection: 'bidirectional',
            isActive: true
        });
        
        await syncFolder.save();
        return syncFolder;
    }
    
    async removeSyncFolder(userId, folderId, clientId = null) {
        if (clientId) {
            const client = await this._getClientOrThrow(userId, clientId);
            await this._removeSyncClient(userId, folderId, client._id);
        } else {
            await this._removeEntireSyncFolder(userId, folderId);
        }
    }
    
    // === GŁÓWNY INTERFEJS SYNCHRONIZACJI ===
    
    async getSyncState(userId, clientId, folderId) {
        const client = await this._getClientOrThrow(userId, clientId);
        await this._getSyncFolderOrThrow(userId, folderId, client._id);
        
        const files = await File.find({
            user: userId,
            folder: folderId,
            isDeleted: { $ne: true }
        });
        
        const syncStates = await FileSyncState.find({
            user: userId,
            client: client._id,
            file: { $in: files.map(f => f._id) }
        });
        
        const syncStateMap = new Map(
            syncStates.map(state => [state.file.toString(), state])
        );
        
        const syncData = files.map(file => this._createFileSyncData(file, syncStateMap));
        const deletedFiles = await this._getDeletedFilesSyncData(userId, client._id, folderId);
        
        return {
            folderId,
            syncData: [...syncData, ...deletedFiles],
            lastSyncDate: new Date()
        };
    }
    
    async confirmSyncCompleted(userId, clientId, folderId, completedOperations) {
        const client = await this._getClientOrThrow(userId, clientId);
        
        for (const operation of completedOperations) {
            await this._processCompletedOperation(userId, client._id, operation);
        }
        
        await this._updateFolderLastSyncDate(userId, folderId, client._id);
        
        return { success: true, message: 'Synchronizacja potwierdzona' };
    }
    
    // === OPERACJE NA PLIKACH ===
    
    async getFileForDownload(userId, clientId, fileId) {
        await this._getClientOrThrow(userId, clientId);
        const file = await this._getFileOrThrow(userId, fileId);
        
        const FileService = require('./FileService');
        const downloadResult = await FileService.downloadFile(userId, fileId, { asBase64: true });
        
        return {
            file: this._formatFileForSync(file),
            content: downloadResult.content,
            contentType: downloadResult.contentType
        };
    }
    
    async uploadFileFromClient(userId, clientId, folderId, fileData) {
        const client = await this._getClientOrThrow(userId, clientId);
        const { name, content, hash, clientFileId, clientLastModified } = fileData;
        
        const FileService = require('./FileService');
        const mimetype = this._getMimeTypeFromFileName(name);
        
        const file = await FileService.createFile(userId, {
            originalName: name,
            mimetype,
            folderId,
            content,
            hash,
            lastModified: clientLastModified
        });
        
        await this._updateFileSyncState(
            userId,
            client._id,
            file._id,
            'unchanged',
            hash,
            clientFileId,
            name,
            null,
            new Date(clientLastModified)
        );
        
        return { fileId: file._id };
    }
    
    async updateFileFromClient(userId, clientId, fileId, fileData) {
        const client = await this._getClientOrThrow(userId, clientId);
        const file = await this._getFileOrThrow(userId, fileId);
        const { content, hash, clientFileId, clientLastModified } = fileData;
        
        if (file.path) {
            const path = require('path');
            const fs = require('fs');
            const filePath = path.resolve(process.env.UPLOADS_DIR, file.path);
            const fileBuffer = Buffer.from(content, 'base64');
            
            fs.writeFileSync(filePath, fileBuffer);
            
            const { generateFileHash, getFileStats } = require('../utils/fileUtils');
            const newHash = await generateFileHash(filePath);
            const fileStats = await getFileStats(filePath);
            
            file.fileHash = newHash;
            file.lastModified = fileStats.lastModified;
            file.size = fileStats.size;
            await file.save();
        }
        
        await this._updateFileSyncState(
            userId,
            client._id,
            fileId,
            'unchanged',
            hash,
            clientFileId,
            file.originalName,
            null,
            new Date(clientLastModified)
        );
        
        return { fileId };
    }
    
    async confirmFileOperation(userId, clientId, fileId, clientFileInfo) {
        const client = await this._getClientOrThrow(userId, clientId);
        const file = await this._getFileOrThrow(userId, fileId);
        
        const { clientFileId, clientFileName, clientPath, clientLastModified } = clientFileInfo;
        
        await this._updateFileSyncState(
            userId,
            client._id,
            fileId,
            'unchanged',
            file.fileHash,
            clientFileId,
            clientFileName,
            clientPath,
            new Date(clientLastModified)
        );
        
        return { success: true };
    }
    
    async confirmFileDeleted(userId, clientId, fileId) {
        const client = await this._getClientOrThrow(userId, clientId);
        
        await FileSyncState.deleteOne({
            user: userId,
            client: client._id,
            file: fileId
        });
        
        return { success: true };
    }
    
    // === OZNACZANIE PLIKÓW DO SYNCHRONIZACJI ===
    
    async markFileForSync(userId, fileId, operation = 'modified') {
		const file = await File.findById(fileId);
		if (!file?.folder) return;
		
		const syncFolders = await SyncFolder.find({
			user: userId,
			folder: file.folder
		});
		
		if (syncFolders.length === 0) return;
		
		for (const syncFolder of syncFolders) {
			const activeClients = syncFolder.clients.filter(c => c.isActive);
			
			for (const clientConfig of activeClients) {
				await this._updateFileSyncState(
					userId,
					clientConfig.client,
					fileId,
					operation,
					file.fileHash
				);
			}
		}
	}
	
	async markFileAsDeleted(userId, fileId) {
		const file = await File.findById(fileId);
		if (!file?.folder) return;
		
		const syncFolders = await SyncFolder.find({
			user: userId,
			folder: file.folder
		});
		
		if (syncFolders.length === 0) return;
		
		for (const syncFolder of syncFolders) {
			const activeClients = syncFolder.clients.filter(c => c.isActive);
			
			for (const clientConfig of activeClients) {
				// Sprawdź czy plik był wcześniej zsynchronizowany
				const existingState = await FileSyncState.findOne({
					user: userId,
					client: clientConfig.client,
					file: fileId
				});
				
				if (existingState) {
					// Oznacz jako usunięty tylko jeśli był wcześniej zsynchronizowany
					await this._updateFileSyncState(
						userId,
						clientConfig.client,
						fileId,
						'deleted',
						file.fileHash
					);
				}
			}
		}
	}
    
    async markFolderForSync(userId, folderId) {
        const files = await File.find({ 
            user: userId, 
            folder: folderId,
            isDeleted: { $ne: true }
        });
        
        for (const file of files) {
            await this.markFileForSync(userId, file._id, 'added');
        }
    }
    
    // === ZARZĄDZANIE SYNCHRONIZACJAMI - INTERFEJS WEBOWY ===
    
    async getSyncFolder(userId, folderId) {
        const syncFolder = await SyncFolder.findOne({
            user: userId,
            folder: folderId
        }).populate('clients.client');
        
        if (!syncFolder) return null;
        
        const enrichedClients = syncFolder.clients.map(clientConfig => ({
            ...clientConfig.toObject(),
            name: clientConfig.client?.name || clientConfig.clientFolderName || 'Nieznany klient',
            type: clientConfig.client?.type || 'unknown',
            clientId: clientConfig.client?.clientId || clientConfig.clientId
        }));
        
        return {
            ...syncFolder.toObject(),
            clients: enrichedClients
        };
    }
    
    async updateSyncSettings(userId, folderId, syncId, settings) {
        const { syncDirection, clientFolderPath, isActive } = settings;
        
        const updateData = {
            updatedAt: new Date(),
            'clients.$.updatedAt': new Date()
        };
        
        if (syncDirection !== undefined) updateData['clients.$.syncDirection'] = syncDirection;
        if (clientFolderPath !== undefined) updateData['clients.$.clientFolderPath'] = clientFolderPath;
        if (isActive !== undefined) updateData['clients.$.isActive'] = isActive;
        
        const result = await SyncFolder.updateOne(
            {
                user: userId,
                folder: folderId,
                'clients._id': syncId
            },
            { $set: updateData }
        );
        
        return result.matchedCount > 0;
    }
    
    async deleteSyncClient(userId, folderId, syncId) {
        return await this._removeSyncClient(userId, folderId, syncId);
    }
    
    // === METODY PRYWATNE - WALIDACJA ===
    
    async _getClientOrThrow(userId, clientId) {
        const client = await this.getClient(userId, clientId);
        if (!client) throw new Error('Klient nie znaleziony');
        return client;
    }
    
    async _getServerFolderOrThrow(userId, serverFolderId) {
        const serverFolder = await Folder.findOne({ 
            _id: serverFolderId, 
            user: userId 
        });
        if (!serverFolder) throw new Error('Folder serwera nie znaleziony');
        return serverFolder;
    }
    
    async _getSyncFolderOrThrow(userId, folderId, clientId) {
        const syncFolder = await SyncFolder.findOne({
            user: userId,
            folder: folderId,
            'clients.client': clientId,
            'clients.isActive': true
        });
        
        if (!syncFolder) throw new Error('Folder nie jest synchronizowany przez tego klienta');
        return syncFolder;
    }
    
    async _getFileOrThrow(userId, fileId) {
        const file = await File.findOne({
            _id: fileId,
            user: userId,
            isDeleted: { $ne: true }
        });
        
        if (!file) throw new Error('Plik nie znaleziony');
        return file;
    }
    
    _validateClientNotAlreadySync(syncFolder, clientId) {
        const existingClient = syncFolder.clients.find(c => 
            c.client.toString() === clientId.toString()
        );
        
        if (existingClient) throw new Error('Klient już synchronizuje ten folder');
    }
    
    // === METODY PRYWATNE - LOGIKA SYNCHRONIZACJI ===
    
    _createFileSyncData(file, syncStateMap) {
		const syncState = syncStateMap.get(file._id.toString());
		
		let operation;
		if (!syncState) {
			// Brak stanu synchronizacji = nowy plik
			operation = 'added';
		} else if (syncState.lastKnownHash !== file.fileHash) {
			// Hash się zmienił = plik został zmodyfikowany
			operation = 'modified';
		} else {
			// Hash nie zmienił się = bez zmian
			operation = 'unchanged';
		}
		
		return {
			fileId: file._id.toString(),
			originalName: file.originalName,
			mimetype: file.mimetype,
			size: file.size,
			hash: file.fileHash,
			lastModified: file.lastModified,
			category: file.category,
			operation,
			lastSyncDate: syncState?.lastSyncDate || null,
			clientPath: syncState?.clientPath || null,
			clientFileName: syncState?.clientFileName || null,
			clientFileId: syncState?.clientFileId || null,
			clientLastModified: syncState?.clientLastModified || null
		};
	}
		
    async _getDeletedFilesSyncData(userId, clientId, folderId) {
		// Znajdź wszystkie stany synchronizacji oznaczone jako 'deleted' dla tego klienta
		const deletedStates = await FileSyncState.find({
			user: userId,
			client: clientId,
			operation: 'deleted'
		}).populate({
			path: 'file',
			match: { folder: folderId } // Filtruj po folderze już na poziomie populate
		});
		
		// Odfiltruj te gdzie file nie pasuje do folderu (będzie null po populate z match)
		return deletedStates
			.filter(state => state.file !== null)
			.map(state => ({
				fileId: state.file._id.toString(),
				originalName: state.file.originalName,
				operation: 'deleted',
				lastSyncDate: state.lastSyncDate,
				clientPath: state.clientPath,
				clientFileName: state.clientFileName,
				clientFileId: state.clientFileId
			}));
	}
    
    async _processCompletedOperation(userId, clientId, operation) {
		const { fileId, operation: op, error, fileName } = operation;
		
		if (op === 'deleted' || op === 'deleted_from_server') {
			await FileSyncState.deleteOne({
				user: userId,
				client: clientId,
				file: fileId
			});
			console.log(`[SYNC] Usunięto stan synchronizacji dla pliku: ${fileName || fileId}`);
			
		} else if (op === 'error') {
			console.error(`[SYNC] Błąd operacji dla pliku ${fileName || fileId}: ${error}`);
			// Pozostaw stan synchronizacji bez zmian - będzie ponowiona próba przy następnej synchronizacji
			
		} else if (operation.clientFileId) {
			// Operacje upload/update - aktualizuj stan
			const file = await File.findById(fileId);
			if (file) {
				await this._updateFileSyncState(
					userId,
					clientId,
					fileId,
					'unchanged',
					file.fileHash,
					operation.clientFileId,
					operation.fileName || file.originalName,
					null,
					new Date()
				);
			}
		}
	}
    
    // === METODY PRYWATNE - CRUD OPERACJE ===
    
    async _updateFolderLastSyncDate(userId, folderId, clientId) {
        await SyncFolder.updateOne(
            { 
                user: userId, 
                folder: folderId,
                'clients.client': clientId 
            },
            { 
                $set: { 
                    'clients.$.lastSyncDate': new Date(),
                    updatedAt: new Date()
                }
            }
        );
    }
    
    async _removeSyncClient(userId, folderId, clientId) {
        const result = await SyncFolder.updateOne(
            { user: userId, folder: folderId },
            {
                $pull: { clients: { _id: clientId } },
                $set: { updatedAt: new Date() }
            }
        );
        
        if (result.matchedCount > 0) {
            await this._cleanupEmptySyncFolder(userId, folderId);
            await this._cleanupClientFileSyncStates(userId, folderId, clientId);
            return true;
        }
        
        return false;
    }
    
    async _removeEntireSyncFolder(userId, folderId) {
        await SyncFolder.deleteOne({ user: userId, folder: folderId });
        
        const folderFiles = await File.find({ 
            user: userId, 
            folder: folderId 
        }).select('_id');
        
        if (folderFiles.length > 0) {
            const fileIds = folderFiles.map(f => f._id);
            await FileSyncState.deleteMany({
                user: userId,
                file: { $in: fileIds }
            });
        }
    }
    
    async _cleanupEmptySyncFolder(userId, folderId) {
        const syncFolder = await SyncFolder.findOne({ user: userId, folder: folderId });
        
        if (syncFolder && syncFolder.clients.length === 0) {
            await SyncFolder.deleteOne({ user: userId, folder: folderId });
        }
    }
    
    async _cleanupClientFileSyncStates(userId, folderId, clientId) {
        const folderFiles = await File.find({ 
            user: userId, 
            folder: folderId 
        }).select('_id');
        
        if (folderFiles.length > 0) {
            const fileIds = folderFiles.map(f => f._id);
            await FileSyncState.deleteMany({
                user: userId,
                client: clientId,
                file: { $in: fileIds }
            });
        }
    }
    
    async _updateFileSyncState(userId, clientId, fileId, operation, hash = null, clientFileId = null, clientFileName = null, clientPath = null, clientLastModified = null) {
        const updateData = {
            operation,
            lastKnownHash: hash,
            lastSyncDate: new Date(),
            updatedAt: new Date()
        };
        
        if (clientFileId !== null) updateData.clientFileId = clientFileId;
        if (clientFileName !== null) updateData.clientFileName = clientFileName;
        if (clientPath !== null) updateData.clientPath = clientPath;
        if (clientLastModified !== null) updateData.clientLastModified = clientLastModified;
        
        await FileSyncState.updateOne(
            { user: userId, client: clientId, file: fileId },
            updateData,
            { upsert: true }
        );
    }
    
    // === METODY POMOCNICZE ===
    
    _formatFileForSync(file) {
        return {
            id: file._id.toString(),
            originalName: file.originalName,
            mimetype: file.mimetype,
            size: file.size,
            hash: file.fileHash,
            lastModified: file.lastModified,
            path: file.path,
            category: file.category
        };
    }
    
    _generateClientId(userId, type) {
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substring(2);
        const userIdShort = userId.toString().slice(-6);
        
        return `${type}-${userIdShort}-${timestamp}-${random}`;
    }
    
    _getMimeTypeFromFileName(fileName) {
        const path = require('path');
        const mimeTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.drawio': 'application/xml',
            '.ct': 'application/octet-stream'
        };
        
        const ext = path.extname(fileName).toLowerCase();
        return mimeTypes[ext] || 'application/octet-stream';
    }
	
	async findExistingFileByClientId(userId, clientId, clientFileId, folderId = null) {
		const client = await this._getClientOrThrow(userId, clientId);
		
		const query = {
			user: userId,
			client: client._id,
			clientFileId: clientFileId
		};
		
		const syncState = await FileSyncState.findOne(query).populate('file');
		
		if (!syncState?.file || syncState.file.isDeleted) {
			return null;
		}
		
		// Jeśli określono folderId, sprawdź czy plik należy do tego folderu
		if (folderId && syncState.file.folder?.toString() !== folderId) {
			return null;
		}
		
		return {
			fileId: syncState.file._id.toString(),
			originalName: syncState.file.originalName,
			hash: syncState.file.fileHash,
			lastModified: syncState.file.lastModified,
			clientFileId: syncState.clientFileId,
			clientFileName: syncState.clientFileName,
			clientLastModified: syncState.clientLastModified,
			size: syncState.file.size
		};
	}

	async findExistingFileByNameAndHash(userId, folderId, fileName, fileHash) {
		const file = await File.findOne({
			user: userId,
			folder: folderId,
			originalName: fileName,
			fileHash: fileHash,
			isDeleted: { $ne: true }
		});
		
		return file;
	}
}

module.exports = new SyncService();