const mongoose = require('mongoose');
const Client = require('../models/Client');
const SyncFolder = require('../models/SyncFolder');
const FileSyncState = require('../models/FileSyncState');
const File = require('../models/File');
const Folder = require('../models/Folder');

/**
 * Serwis synchronizacji plików między klientami a serwerem
 * 
 * Proces wymaga 3 etapów:
 * 
 * 1. REJESTRACJA KLIENTA
 *    - registerClient() - rejestracja klienta w systemie
 *    - getClient() - pobranie danych klienta
 * 
 * 2. KONFIGURACJA FOLDERU
 *    - addFolderToSync() - mapowanie folderu klienta na folder serwera
 * 
 * 3. SYNCHRONIZACJA
 *    a) getSyncData() - klient PODEJMUJE DECYZJE o operacjach na podstawie zwróconych danych
 *    b) Wykonanie operacji:
 *       - downloadFileFromServer()
 *       - uploadNewFileToServer()
 *       - updateExistingFileOnServer()
 *       - confirmFileDeletedOnClient()
 *    c) confirmSyncCompleted() - finalne potwierdzenie
 */
class SyncService {
    
    // ===== SEKCJA KLIENT =====
    
    /**
     * Rejestruje nowego klienta synchronizacji
     */
    async registerClient(userId, { type, name, metadata = {} }) {
        const client = new Client({
            user: userId,
            type,
            name,
            metadata,
            isActive: true,
            lastSeen: new Date()
        });
        
        await client.save();
        return client;
    }
	
	/**
     * Usuwa klienta z synchronizacji folderu
     */
    async removeSyncClient(userId, folderId, syncId) {
        return await this._removeSyncClientBySyncId(userId, folderId, syncId);
    }
    
    /**
     * Pobiera dane klienta
     */
    async getClient(userId, clientId) {
        return await Client.findOne({ 
            user: userId, 
            _id: clientId,
            isActive: true 
        });
    }
    
    /**
     * Aktualizuje aktywność klienta
     */
    async updateClientActivity(userId, clientId) {
        await Client.updateOne(
            { user: userId, _id: clientId },
            { lastSeen: new Date() }
        );
    }
    
    // ===== SEKCJA SYNC FOLDER =====
    
    /**
     * Dodaje folder do synchronizacji dla klienta
     */
    async addFolderToSync(userId, clientId, clientFolderPath, serverFolderId, clientFolderName = null) {
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
            clientId: client._id.toString(),
            clientFolderId: clientFolderPath,
            clientFolderName: clientFolderName || serverFolder.name,
            clientFolderPath: clientFolderPath,
            syncDirection: 'bidirectional',
            isActive: true
        });
        
        await syncFolder.save();
        return syncFolder;
    }
    
    /**
     * Usuwa folder z synchronizacji
     */
    async removeFolderFromSync(userId, folderId, clientId = null) {
		if (clientId) {
			console.log(`Usuwanie folderu ${folderId} z synchronizacji dla klienta ${clientId} (użytkownik: ${userId})`);
			const client = await this._getClientOrThrow(userId, clientId);
			// POPRAWKA: Używamy _removeSyncClient zamiast _removeSyncClientBySyncId
			await this._removeSyncClient(userId, folderId, client._id);
		} else {
			console.log(`Usuwanie całego folderu ${folderId} z synchronizacji dla użytkownika ${userId}`);
			await this._removeEntireSyncFolder(userId, folderId);
		}
	}
	
	/**
     * Pobiera informacje o synchronizacji folderu
     */
    async getSyncFolderInfo(userId, folderId) {
        const syncFolder = await SyncFolder.findOne({
            user: userId,
            folder: folderId
        }).populate('clients.client');
        
        if (!syncFolder) return null;
        
        const enrichedClients = syncFolder.clients.map(clientConfig => ({
            ...clientConfig.toObject(),
            name: clientConfig.client?.name || clientConfig.clientFolderName || 'Nieznany klient',
            type: clientConfig.client?.type || 'unknown',
            clientId: clientConfig.client?._id.toString() || clientConfig.clientId
        }));
        
        return {
            ...syncFolder.toObject(),
            clients: enrichedClients
        };
    }
    
    // ===== GŁÓWNA SEKCJA SYNCHRONIZACJI =====
    
    /**
     * KROK 1: Pobiera dane synchronizacji dla klienta
     * Zwraca listę wszystkich operacji do wykonania
     */
    async getSyncData(userId, clientId, folderId) {
		const client = await this._getClientOrThrow(userId, clientId);
		await this._getSyncFolderOrThrow(userId, folderId, client._id);
		
		// Pobierz wszystkie pliki włącznie z soft-deleted
		const files = await File.find({
			user: userId,
			folder: folderId
		});
		
		const syncStates = await FileSyncState.find({
			user: userId,
			client: client._id,
			file: { $in: files.map(f => f._id) }
		});
		
		const syncStateMap = new Map(
			syncStates.map(state => [state.file.toString(), state])
		);
		
		console.log(`[SYNC] Folder ${folderId}: ${files.length} plików, ${syncStates.length} stanów synchronizacji`);
		
		const syncData = [];
		
		// Pliki aktywne i usunięte
		for (const file of files) {
			const fileSyncData = this._createFileSyncData(file, syncStateMap);
			syncData.push(fileSyncData);
			
			if (fileSyncData.operation !== 'unchanged') {
				console.log(`  - ${fileSyncData.operation}: ${fileSyncData.file?.originalName}`);
			}
		}
		
		// Pliki usunięte (bez rekordu w File - tylko w FileSyncState)
		const deletedFiles = await this._getDeletedFilesSyncData(userId, client._id, folderId);
		syncData.push(...deletedFiles);
		
		const operations = syncData.filter(data => data.operation !== 'unchanged');
		console.log(`[SYNC] Operacje do wykonania: ${operations.length}`);
		
		return {
			folderId,
			syncData,
			lastSyncDate: new Date()
		};
	}
    
    /**
     * KROK 2A: Pobiera plik z serwera (nowy lub zaktualizowany)
     */
    async downloadFileFromServer(userId, clientId, fileId) {
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
    
    /**
     * KROK 2B: Wysyła nowy plik z klienta na serwer
     */
    async uploadNewFileToServer(userId, clientId, folderId, fileData) {
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
    
    /**
     * KROK 2C: Aktualizuje istniejący plik na serwerze
     */
    async updateExistingFileOnServer(userId, clientId, fileId, fileData) {
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
    
    /**
     * KROK 2D: Potwierdza pobranie pliku przez klienta
     */
    async confirmFileDownloaded(userId, clientId, fileId, clientFileInfo) {
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
    
    /**
     * KROK 2E: Potwierdza usunięcie pliku przez klienta
     */
    async confirmFileDeletedOnClient(userId, clientId, fileId) {
        const client = await this._getClientOrThrow(userId, clientId);
        
        await FileSyncState.deleteOne({
            user: userId,
            client: client._id,
            file: fileId
        });
        
        return { success: true };
    }
	
	/**
	 * KROK 2F: Usuwa plik z serwera (żądanie od klienta)
	 */
	async deleteFileFromServer(userId, clientId, fileId) {
		const client = await this._getClientOrThrow(userId, clientId);
		const file = await this._getFileOrThrow(userId, fileId);
		
		// Sprawdź czy klient ma prawo synchronizować ten folder
		if (file.folder) {
			await this._getSyncFolderOrThrow(userId, file.folder, client._id);
		}
		
		// Użyj FileService do usunięcia pliku (soft delete)
		const FileService = require('./FileService');
		await FileService.deleteFile(userId, fileId, false); // false = soft delete
		
		// Usuń stan synchronizacji dla tego klienta
		await FileSyncState.deleteOne({
			user: userId,
			client: client._id,
			file: fileId
		});
		
		return { success: true, message: 'Plik usunięty z serwera' };
	}
    
    /**
     * KROK 3: Potwierdza zakończenie synchronizacji
     */
    async confirmSyncCompleted(userId, clientId, folderId) {
		const client = await this._getClientOrThrow(userId, clientId);
		const syncFolder = await this._getSyncFolderOrThrow(userId, folderId, client._id);
		
		// Sprawdź czy są jakieś pliki wymagające synchronizacji
		const pendingOperations = await this._checkPendingOperations(userId, client._id, folderId);
		
		if (pendingOperations.length > 0) {
			console.log(`[SYNC] Ostrzeżenie: ${pendingOperations.length} operacji wciąż oczekuje na synchronizację`);
			// Można zdecydować czy zwrócić błąd czy tylko ostrzeżenie
			return { 
				success: true, 
				warning: `${pendingOperations.length} operacji może wymagać ponownej synchronizacji`,
				pendingCount: pendingOperations.length
			};
		}
		
		// Aktualizuj datę ostatniej synchronizacji
		await this._updateFolderLastSyncDate(userId, folderId, client._id);
		
		console.log(`[SYNC] Synchronizacja folderu ${folderId} dla klienta ${client.name} zakończona pomyślnie`);
		
		return { 
			success: true, 
			message: 'Synchronizacja potwierdzona',
			syncedAt: new Date()
		};
	}
    
    // ===== SEKCJA OZNACZANIA DO SYNCHRONIZACJI (tylko do przez FileService i FolderService, nie tworzyć endpointów) =====
    
    /**
     * Oznacza plik do synchronizacji (np. po modyfikacji)
     */
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
    
    /**
     * Oznacza plik jako usunięty
     */
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
                const existingState = await FileSyncState.findOne({
                    user: userId,
                    client: clientConfig.client,
                    file: fileId
                });
                
                if (existingState) {
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
    
    /**
     * Oznacza wszystkie pliki w folderze do synchronizacji
     */
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
    
    // ===== ZARZĄDZANIE USTAWIENIAMI SYNCHRONIZACJI =====
    
    /**
     * Aktualizuje ustawienia synchronizacji
     */
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
    
    // ===== PUBLICZNE FUNKCJE POMOCNICZE =====
    
    /**
	 * Znajduje wszystkie istniejące pliki po ID klienta
	 */
	async findFileByClientId(userId, clientId, clientFileId, folderId = null) {
		const client = await this._getClientOrThrow(userId, clientId);
		
		const query = {
			user: userId,
			client: client._id,
			clientFileId: clientFileId
		};
		
		// Znajdź wszystkie stany synchronizacji pasujące do kryteriów
		const syncStates = await FileSyncState.find(query).populate('file');
		
		const results = [];
		
		for (const syncState of syncStates) {
			// Pomiń jeśli plik nie istnieje lub jest usunięty
			if (!syncState?.file || syncState.file.isDeleted) {
				continue;
			}
			
			// Sprawdź folder jeśli określono
			if (folderId && syncState.file.folder?.toString() !== folderId) {
				continue;
			}
			
			results.push({
				fileId: syncState.file._id.toString(),
				originalName: syncState.file.originalName,
				hash: syncState.file.fileHash,
				lastModified: syncState.file.lastModified,
				clientFileId: syncState.clientFileId,
				clientFileName: syncState.clientFileName,
				clientLastModified: syncState.clientLastModified,
				size: syncState.file.size,
				folder: syncState.file.folder?.toString() || null
			});
		}
		
		return results;
	}

	/**
	 * Znajduje wszystkie istniejące pliki po nazwie i hashu
	 */
	async findFileByNameAndHash(userId, folderId, fileName, fileHash) {
		const query = {
			user: userId,
			originalName: fileName,
			fileHash: fileHash,
			isDeleted: { $ne: true }
		};
		
		// Dodaj folder do zapytania jeśli określono
		if (folderId) {
			query.folder = folderId;
		}
		
		const files = await File.find(query);
		
		return files.map(file => ({
			fileId: file._id.toString(),
			originalName: file.originalName,
			hash: file.fileHash,
			lastModified: file.lastModified,
			size: file.size,
			folder: file.folder?.toString() || null,
			mimetype: file.mimetype,
			category: file.category,
			path: file.path
		}));
	}
    
    // ===== FUNKCJE PRYWATNE - WALIDACJA =====
    
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
    
    // ===== FUNKCJE PRYWATNE - LOGIKA SYNCHRONIZACJI =====
    
    _createFileSyncData(file, syncStateMap) {
		if (!file) {
			console.error('[SYNC ERROR] Plik jest undefined w _createFileSyncData');
			throw new Error('Plik nie może być undefined');
		}
		
		if (!file._id) {
			console.error('[SYNC ERROR] Plik nie ma _id:', file);
			throw new Error('Plik musi mieć _id');
		}
		
		console.log(`[SYNC DEBUG] Tworzenie danych sync dla pliku: ${file.originalName} (${file._id})`);
		
		const syncState = syncStateMap.get(file._id.toString());
		
		let operation;
		
		// NOWA LOGIKA: Sprawdź czy plik został usunięty na serwerze
		if (file.isDeleted && syncState) {
			operation = 'deleted_from_server';
			console.log(`[SYNC] Plik usunięty na serwerze: ${file.originalName}`);
		} else if (!syncState) {
			operation = 'added';
			console.log(`[SYNC] Nowy plik do synchronizacji: ${file.originalName} (${file.fileHash})`);
		} else if (syncState.lastKnownHash !== file.fileHash) {
			operation = 'modified';
			console.log(`[SYNC] Plik zmodyfikowany: ${file.originalName} (${syncState.lastKnownHash} -> ${file.fileHash})`);
		} else {
			operation = 'unchanged';
		}
		
		const result = {
			fileId: file._id.toString(),
			file: {
				_id: file._id.toString(),
				originalName: file.originalName,
				mimetype: file.mimetype,
				size: file.size,
				fileHash: file.fileHash,
				lastModified: file.lastModified,
				category: file.category,
				path: file.path,
				isDeleted: file.isDeleted || false
			},
			operation,
			lastSyncDate: syncState?.lastSyncDate || null,
			clientPath: syncState?.clientPath || null,
			clientFileName: syncState?.clientFileName || null,
			clientFileId: syncState?.clientFileId || null,
			clientLastModified: syncState?.clientLastModified || null
		};
		
		console.log(`[SYNC DEBUG] Utworzono dane sync:`, {
			fileId: result.fileId,
			fileName: result.file.originalName,
			operation: result.operation,
			hasClientFileId: !!result.clientFileId
		});
		
		return result;
	}
    
    async _getDeletedFilesSyncData(userId, clientId, folderId) {
        const deletedStates = await FileSyncState.find({
            user: userId,
            client: clientId,
            operation: 'deleted'
        }).populate({
            path: 'file',
            match: { folder: folderId }
        });
        
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
			
		} else if (operation.clientFileId) {
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
	
	/**
	 * Sprawdza czy są operacje oczekujące na synchronizację
	 */
	async _checkPendingOperations(userId, clientId, folderId) {
		// Pobierz wszystkie pliki w folderze
		const files = await File.find({
			user: userId,
			folder: folderId,
			isDeleted: { $ne: true }
		});
		
		// Pobierz stany synchronizacji
		const syncStates = await FileSyncState.find({
			user: userId,
			client: clientId,
			file: { $in: files.map(f => f._id) }
		});
		
		const syncStateMap = new Map(
			syncStates.map(state => [state.file.toString(), state])
		);
		
		const pendingOperations = [];
		
		// Sprawdź pliki aktywne
		for (const file of files) {
			const syncState = syncStateMap.get(file._id.toString());
			
			let operation;
			if (!syncState) {
				operation = 'added';
			} else if (syncState.lastKnownHash !== file.fileHash) {
				operation = 'modified';
			} else {
				operation = 'unchanged';
			}
			
			if (operation !== 'unchanged') {
				pendingOperations.push({
					fileId: file._id.toString(),
					fileName: file.originalName,
					operation
				});
			}
		}
		
		// Sprawdź pliki oznaczone jako usunięte
		const deletedOperations = await FileSyncState.find({
			user: userId,
			client: clientId,
			operation: 'deleted'
		}).populate({
			path: 'file',
			match: { folder: folderId }
		});
		
		for (const state of deletedOperations) {
			if (state.file) {
				pendingOperations.push({
					fileId: state.file._id.toString(),
					fileName: state.file.originalName,
					operation: 'deleted'
				});
			}
		}
		
		return pendingOperations;
	}
    
    // ===== FUNKCJE PRYWATNE - CRUD OPERACJE =====
    
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
	
	async _removeSyncClientBySyncId(userId, folderId, syncId) {
		// Najpierw znajdź konfigurację klienta by pobrać clientId
		const syncFolder = await SyncFolder.findOne({ 
			user: userId, 
			folder: folderId,
			'clients._id': syncId 
		});
		
		if (!syncFolder) {
			return false;
		}
		
		const clientConfig = syncFolder.clients.find(c => c._id.toString() === syncId);
		if (!clientConfig) {
			return false;
		}
		
		const clientIdToCleanup = clientConfig.client;
		
		// Usuń konfigurację synchronizacji
		const result = await SyncFolder.updateOne(
			{ user: userId, folder: folderId },
			{
				$pull: { clients: { _id: syncId } },
				$set: { updatedAt: new Date() }
			}
		);
		
		if (result.matchedCount > 0) {
			// Wyczyść puste foldery synchronizacji
			await this._cleanupEmptySyncFolder(userId, folderId);
			
			// Wyczyść stany synchronizacji dla tego klienta
			await this._cleanupClientFileSyncStates(userId, folderId, clientIdToCleanup);
			
			return true;
		}
		
		return false;
	}
    
    async _removeSyncClient(userId, folderId, clientId) {
		// POPRAWKA: Szukamy po client field, nie po _id
		const result = await SyncFolder.updateOne(
			{ user: userId, folder: folderId },
			{
				$pull: { clients: { client: clientId } }, // ← TUTAJ BYŁA GŁÓWNA BŁĄD
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
			lastSyncDate: new Date(),
			updatedAt: new Date()
		};
		
		// KLUCZOWA POPRAWKA: Dla nowych plików nie ustawiaj lastKnownHash
		if (operation === 'added') {
			updateData.lastKnownHash = null; // ← TUTAJ ZMIANA
		} else {
			updateData.lastKnownHash = hash;
		}
		
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
    
    // ===== FUNKCJE POMOCNICZE =====
    
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
}

module.exports = new SyncService();