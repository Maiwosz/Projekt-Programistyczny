const GoogleDriveConnectionService = require('./GoogleDriveConnectionService');
const SyncService = require('./SyncService');
const FileService = require('./FileService');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { generateFileHash } = require('../utils/fileUtils');

class GoogleDriveSyncService {
    
    // === GŁÓWNE METODY SYNCHRONIZACJI ===
    
    async syncFolder(userId, folderId = null) {
        console.log(`[GDRIVE] Rozpoczęcie synchronizacji - userId: ${userId}, folderId: ${folderId}`);
        
        const driveClient = await GoogleDriveConnectionService.getValidatedClient(userId);
        
        try {
            await driveClient.updateSyncStatus(true);
            
            if (folderId) {
                return await this._syncSingleFolder(driveClient, folderId);
            } else {
                return await this._syncAllFolders(driveClient);
            }
            
        } catch (error) {
            await driveClient.updateSyncStatus(false, error.message);
            throw error;
        }
    }
    
    async createSyncFolder(userId, serverFolderId, driveFolderId) {
		const driveClient = await GoogleDriveConnectionService.getValidatedClient(userId);
		const drive = await GoogleDriveConnectionService.getDriveInstance(userId);
		
		await this._validateDriveFolder(drive, driveFolderId);
		
		// POPRAWKA: Używaj addFolderToSync zamiast addSyncFolder
		const syncFolder = await SyncService.addFolderToSync(
			userId,
			driveClient.client,
			driveFolderId,  // clientFolderPath
			serverFolderId, // serverFolderId
			null            // clientFolderName (opcjonalne)
		);
		
		await SyncService.markFolderForSync(userId, serverFolderId);
		
		// NOWE: Automatycznie uruchom scheduler jeśli autoSync jest włączone
		try {
			const GoogleDriveClient = require('../models/GoogleDriveClient');
			const clientDoc = await GoogleDriveClient.findOne({ 
				user: userId,
				'status.isConnected': true 
			});
			
			if (clientDoc && clientDoc.syncSettings.autoSync) {
				console.log(`[GDRIVE] AutoSync włączone - dodaję nową synchronizację do schedulera`);
				
				// Importuj scheduler (może być przekazany jako dependency lub singleton)
				const GoogleDriveSchedulerService = require('./GoogleDriveSchedulerService');
				const scheduler = new GoogleDriveSchedulerService(this);
				
				// Restart schedulera z nowymi folderami
				await scheduler.restartAutoSync(userId);
				
				console.log(`[GDRIVE] ✓ Scheduler zaktualizowany dla userId: ${userId}`);
			}
		} catch (schedulerError) {
			console.warn(`[GDRIVE] Błąd aktualizacji schedulera:`, schedulerError.message);
			// Nie przerywaj procesu - synchronizacja została utworzona pomyślnie
		}
		
		return {
			syncFolderId: syncFolder._id,
			serverFolderId: serverFolderId,
			driveFolderId: driveFolderId,
			clientId: driveClient.client,
			message: 'Synchronizacja Google Drive została utworzona pomyślnie'
		};
	}
    
    // === OPERACJE NA FOLDERACH GOOGLE DRIVE ===
    
    async listDriveFolders(userId, parentId = 'root') {
        const drive = await GoogleDriveConnectionService.getDriveInstance(userId);
        
        const response = await drive.files.list({
            q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            pageSize: 100,
            fields: 'files(id, name, parents, createdTime, modifiedTime)'
        });
        
        return response.data.files;
    }
    
    async createDriveFolder(userId, name, parentId = 'root') {
        const drive = await GoogleDriveConnectionService.getDriveInstance(userId);
        
        const response = await drive.files.create({
            resource: {
                name: name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            },
            fields: 'id, name, parents'
        });
        
        return response.data;
    }
    
    // === SYNCHRONIZACJA POJEDYNCZEGO FOLDERU ===
    
    async _syncSingleFolder(driveClient, folderId) {
		console.log(`[GDRIVE] Rozpoczynam synchronizację folderu: ${folderId}`);
    
		await SyncService.updateClientActivity(driveClient.user, driveClient.client);
		
		const syncState = await SyncService.getSyncData(
			driveClient.user, 
			driveClient.client, 
			folderId
		);
		
		console.log(`[GDRIVE] Stan synchronizacji - liczba plików: ${syncState.syncData.length}`);
		
		// 2. Pobierz listę plików z Google Drive
		const driveFolderId = await this._getDriveFolderId(driveClient, folderId);
		console.log(`[GDRIVE] ID folderu Google Drive: ${driveFolderId}`);
		
		const driveFileList = await this._listDriveFiles(driveClient, driveFolderId);
		console.log(`[GDRIVE] Pliki w Google Drive: ${driveFileList.length}`);
		
		const operations = [];
		
		// 3. Synchronizuj serwer -> Google Drive
		console.log(`[GDRIVE] === SYNCHRONIZACJA SERWER -> GOOGLE DRIVE ===`);
		for (const fileData of syncState.syncData) {
			console.log(`[GDRIVE] Przetwarzam plik: ${fileData.file?.originalName || 'BRAK_NAZWY'} (${fileData.operation})`);
			
			try {
				const operation = await this._processSyncOperation(driveClient, fileData, driveFolderId);
				if (operation) {
					operations.push(operation);
					console.log(`[GDRIVE] ✓ Operacja ${operation.operation} zakończona dla: ${operation.fileName || fileData.file?.originalName}`);
				} else {
					console.log(`[GDRIVE] - Brak operacji dla pliku: ${fileData.file?.originalName}`);
				}
			} catch (error) {
				console.error(`[GDRIVE] ✗ Błąd operacji dla pliku ${fileData.file?.originalName}:`, error.message);
				operations.push({
					fileId: fileData.fileId,
					operation: 'error',
					error: error.message,
					fileName: fileData.file?.originalName
				});
			}
		}
		
		// 4. Wykryj pliki usunięte z Google Drive
		console.log(`[GDRIVE] === WYKRYWANIE USUNIĘTYCH PLIKÓW Z GOOGLE DRIVE ===`);
		const deletedFromDriveOperations = await this._detectDeletedFromDrive(
			driveClient, 
			syncState.syncData, 
			driveFileList, 
			folderId
		);
		operations.push(...deletedFromDriveOperations);
		
		// 5. Synchronizuj Google Drive -> serwer (nowe pliki)
		console.log(`[GDRIVE] === SYNCHRONIZACJA GOOGLE DRIVE -> SERWER ===`);
		for (const driveFile of driveFileList) {
			console.log(`[GDRIVE] Przetwarzam plik z Google Drive: ${driveFile.name}`);
			
			try {
				const operation = await this._processGDriveFile(driveClient, driveFile, folderId);
				if (operation) {
					operations.push(operation);
					console.log(`[GDRIVE] ✓ Operacja ${operation.operation} zakończona dla: ${driveFile.name}`);
				} else {
					console.log(`[GDRIVE] - Brak operacji dla pliku: ${driveFile.name}`);
				}
			} catch (error) {
				console.error(`[GDRIVE] ✗ Błąd operacji dla pliku ${driveFile.name}:`, error.message);
			}
		}
		
		// 6. Potwierdź synchronizację
		console.log(`[GDRIVE] Potwierdzam synchronizację - operacji: ${operations.length}`);
		await SyncService.confirmSyncCompleted(
			driveClient.user,
			driveClient.client,
			folderId
		);
		
		await driveClient.updateSyncStatus(true);
		
		console.log(`[GDRIVE] Synchronizacja zakończona - operacji: ${operations.length}`);
		
		return {
			folderId: folderId,
			filesProcessed: operations.length,
			operations: operations
		};
	}
    
    // === SYNCHRONIZACJA WSZYSTKICH FOLDERÓW ===
    
    async _syncAllFolders(driveClient) {
		console.log(`[GDRIVE] Synchronizacja wszystkich folderów dla klienta: ${driveClient.client}`);
		
		const syncFolders = await this._getActiveSyncFolders(driveClient);
		
		if (syncFolders.length === 0) {
			return [{
				message: 'Brak folderów skonfigurowanych do synchronizacji Google Drive',
				totalFolders: 0
			}];
		}
		
		const results = [];
		
		for (const syncFolder of syncFolders) {
			try {
				const result = await this._syncSingleFolder(driveClient, syncFolder.folder);
				results.push(result);
			} catch (error) {
				console.error(`[GDRIVE] Błąd synchronizacji folderu ${syncFolder.folder}:`, error);
				results.push({
					folderId: syncFolder.folder,
					error: error.message,
					filesProcessed: 0,
					operations: []
				});
			}
		}
		
		return results;
	}
    
    // === OPERACJE SYNCHRONIZACJI ===
    
    async _processSyncOperation(driveClient, fileData, driveFolderId) {
		console.log(`[GDRIVE] Przetwarzam operację: ${fileData.operation} dla pliku: ${fileData.file?.originalName}, clientFileId: ${fileData.clientFileId || 'brak'}`);
		
		switch (fileData.operation) {
			case 'added':
				// POPRAWKA: Sprawdź czy plik już istnieje w Google Drive przed przesłaniem
				if (fileData.file?.originalName) {
					const drive = await GoogleDriveConnectionService.getDriveInstance(driveClient.user);
					const existingFiles = await this._findFilesByNameInFolder(
						drive, 
						fileData.file.originalName, 
						driveFolderId
					);
					
					if (existingFiles.length > 0) {
						console.log(`[GDRIVE] Plik ${fileData.file.originalName} już istnieje w Google Drive - linkuję zamiast przesyłać`);
						
						await SyncService.confirmFileDownloaded(
							driveClient.user,
							driveClient.client,
							fileData.fileId,
							{
								clientFileId: existingFiles[0].id,
								clientFileName: existingFiles[0].name,
								clientPath: driveFolderId,
								clientLastModified: existingFiles[0].modifiedTime || new Date().toISOString()
							}
						);
						
						return {
							fileId: fileData.fileId,
							operation: 'linked_existing',
							clientFileId: existingFiles[0].id,
							fileName: fileData.file.originalName
						};
					}
				}
				return await this._uploadToDrive(driveClient, fileData, driveFolderId);
				
			case 'modified':
				return await this._uploadToDrive(driveClient, fileData, driveFolderId);
				
			case 'deleted':
				return await this._deleteFromDrive(driveClient, fileData);
				
			case 'unchanged':
				if (!fileData.clientFileId) {
					console.log(`[GDRIVE] Plik ${fileData.file?.originalName} oznaczony jako unchanged ale brak clientFileId - sprawdzam czy istnieje`);
					
					// Sprawdź czy plik istnieje w Google Drive po nazwie
					if (fileData.file?.originalName) {
						const drive = await GoogleDriveConnectionService.getDriveInstance(driveClient.user);
						const existingFiles = await this._findFilesByNameInFolder(
							drive, 
							fileData.file.originalName, 
							driveFolderId
						);
						
						if (existingFiles.length > 0) {
							console.log(`[GDRIVE] Znaleziono plik ${fileData.file.originalName} w Google Drive - linkuję`);
							
							await SyncService.confirmFileDownloaded(
								driveClient.user,
								driveClient.client,
								fileData.fileId,
								{
									clientFileId: existingFiles[0].id,
									clientFileName: existingFiles[0].name,
									clientPath: driveFolderId,
									clientLastModified: existingFiles[0].modifiedTime || new Date().toISOString()
								}
							);
							
							return {
								fileId: fileData.fileId,
								operation: 'linked_existing',
								clientFileId: existingFiles[0].id,
								fileName: fileData.file.originalName
							};
						}
					}
					
					console.log(`[GDRIVE] Plik ${fileData.file?.originalName} nie istnieje w Google Drive - przesyłam`);
					return await this._uploadToDrive(driveClient, fileData, driveFolderId);
				}
				
				// Sprawdź czy plik nadal istnieje w Google Drive
				const stillExists = await this._verifyFileExistsInDrive(driveClient, fileData.clientFileId);
				if (!stillExists) {
					console.log(`[GDRIVE] Plik ${fileData.file?.originalName} nie istnieje już w Google Drive - przesyłam ponownie`);
					return await this._uploadToDrive(driveClient, fileData, driveFolderId);
				}
				
				console.log(`[GDRIVE] Plik ${fileData.file?.originalName} rzeczywiście unchanged - pomijam`);
				return null;
				
			default:
				console.warn(`[GDRIVE] Nieznana operacja: ${fileData.operation}`);
				return null;
		}
	}
    
    async _uploadToDrive(driveClient, fileData, driveFolderId) {
		const drive = await GoogleDriveConnectionService.getDriveInstance(driveClient.user);
		
		const downloadResult = await SyncService.downloadFileFromServer(
			driveClient.user,
			driveClient.client,
			fileData.fileId
		);
		
		const tempPath = await this._saveToTempFile(downloadResult.file.originalName, downloadResult.content);
		
		try {
			let driveFileId = fileData.clientFileId;
			let response;
			
			// POPRAWKA: Sprawdź czy plik już istnieje w folderze Google Drive po nazwie
			const existingFiles = await this._findFilesByNameInFolder(drive, downloadResult.file.originalName, driveFolderId);
			
			if (driveFileId && fileData.operation === 'modified') {
				// Sprawdź czy plik nadal istnieje
				const fileExists = await this._verifyFileExistsInDrive(driveClient, driveFileId);
				if (!fileExists) {
					console.log(`[GDRIVE] Plik ${driveFileId} nie istnieje - utworzę nowy`);
					driveFileId = null;
				}
			}
			
			if (driveFileId && fileData.operation === 'modified') {
				console.log(`[GDRIVE] Aktualizuję istniejący plik: ${downloadResult.file.originalName} (${driveFileId})`);
				
				response = await drive.files.update({
					fileId: driveFileId,
					media: {
						body: fs.createReadStream(tempPath)
					},
					fields: 'id, name, size, modifiedTime'
				});
				
				console.log(`[GDRIVE] Zaktualizowano plik: ${downloadResult.file.originalName}`);
				
			} else {
				// POPRAWKA: Jeśli plik o tej nazwie już istnieje w folderze, użyj go zamiast tworzyć nowy
				if (existingFiles.length > 0) {
					const existingFile = existingFiles[0]; // Weź pierwszy znaleziony
					console.log(`[GDRIVE] Znaleziono istniejący plik ${downloadResult.file.originalName} (${existingFile.id}) - aktualizuję zamiast tworzyć nowy`);
					
					response = await drive.files.update({
						fileId: existingFile.id,
						media: {
							body: fs.createReadStream(tempPath)
						},
						fields: 'id, name, size, modifiedTime'
					});
					
					driveFileId = existingFile.id;
					
				} else {
					console.log(`[GDRIVE] Tworzę nowy plik: ${downloadResult.file.originalName} w folderze ${driveFolderId}`);
					
					try {
						await drive.files.get({
							fileId: driveFolderId,
							fields: 'id, name, mimeType'
						});
					} catch (error) {
						throw new Error(`Folder Google Drive ${driveFolderId} nie istnieje: ${error.message}`);
					}
					
					response = await drive.files.create({
						resource: {
							name: downloadResult.file.originalName,
							parents: [driveFolderId]
						},
						media: {
							body: fs.createReadStream(tempPath)
						},
						fields: 'id, name, size, modifiedTime'
					});
					
					driveFileId = response.data.id;
					console.log(`[GDRIVE] Przesłano nowy plik: ${downloadResult.file.originalName} z ID: ${driveFileId}`);
				}
			}
			
			await SyncService.confirmFileDownloaded(
				driveClient.user,
				driveClient.client,
				fileData.fileId,
				{
					clientFileId: driveFileId,
					clientFileName: downloadResult.file.originalName,
					clientPath: driveFolderId,
					clientLastModified: new Date().toISOString()
				}
			);
			
			return {
				fileId: fileData.fileId,
				operation: fileData.operation === 'modified' ? 'updated' : 'uploaded',
				clientFileId: driveFileId,
				fileName: downloadResult.file.originalName
			};
			
		} catch (error) {
			console.error(`[GDRIVE] Błąd przesyłania pliku ${downloadResult.file.originalName}:`, error);
			throw error;
		} finally {
			this._cleanupTempFile(tempPath);
		}
	}
	
	async _findFilesByNameInFolder(drive, fileName, folderId) {
		try {
			const response = await drive.files.list({
				q: `'${folderId}' in parents and name='${fileName.replace(/'/g, "\\'")}' and trashed=false`,
				fields: 'files(id, name, modifiedTime)',
				pageSize: 10
			});
			
			return response.data.files || [];
		} catch (error) {
			console.warn(`[GDRIVE] Błąd wyszukiwania plików po nazwie: ${error.message}`);
			return [];
		}
	}
    
    async _deleteFromDrive(driveClient, fileData) {
		if (fileData.clientFileId) {
			const drive = await GoogleDriveConnectionService.getDriveInstance(driveClient.user);
			
			try {
				await drive.files.delete({ fileId: fileData.clientFileId });
				console.log(`[GDRIVE] Usunięto plik: ${fileData.file?.originalName || 'BRAK_NAZWY'}`);
			} catch (error) {
				console.warn(`[GDRIVE] Nie można usunąć pliku z Google Drive: ${error.message}`);
			}
		}
		
		// POPRAWKA: Zmiana confirmFileDeleted na confirmFileDeletedOnClient
		await SyncService.confirmFileDeletedOnClient(
			driveClient.user,
			driveClient.client,
			fileData.fileId
		);
		
		return {
			fileId: fileData.fileId,
			operation: 'deleted'
		};
	}
    
    async _processGDriveFile(driveClient, driveFile, folderId) {
        // Sprawdź czy plik już istnieje w SyncService
        const existingFileData = await this._findExistingFileInSync(
            driveClient, 
            driveFile.id, 
            folderId
        );
        
        if (existingFileData) {
            return await this._updateExistingFile(driveClient, driveFile, existingFileData);
        } else {
            return await this._createNewFile(driveClient, driveFile, folderId);
        }
    }
    
    async _updateExistingFile(driveClient, driveFile, existingFileData) {
		const driveModified = new Date(driveFile.modifiedTime);
		const lastKnownModified = existingFileData.clientLastModified ? 
			new Date(existingFileData.clientLastModified) : new Date(0);
		
		if (driveModified <= lastKnownModified) {
			console.log(`[GDRIVE] Plik ${driveFile.name} - data modyfikacji niezmieniona, pomijanie`);
			return null;
		}
		
		const tempPath = await this._downloadDriveFile(driveClient, driveFile);
		
		try {
			const newHash = await generateFileHash(tempPath);
			
			if (existingFileData.hash === newHash) {
				console.log(`[GDRIVE] Plik ${driveFile.name} - hash identyczny, aktualizacja tylko metadanych`);
				
				// POPRAWKA: Zmiana confirmFileOperation na confirmFileDownloaded
				await SyncService.confirmFileDownloaded(
					driveClient.user,
					driveClient.client,
					existingFileData.fileId,
					{
						clientFileId: driveFile.id,
						clientFileName: driveFile.name,
						clientPath: null,
						clientLastModified: driveFile.modifiedTime
					}
				);
				
				return null;
			}
			
			const fileBuffer = fs.readFileSync(tempPath);
			
			// POPRAWKA: Zmiana updateFileFromClient na updateExistingFileOnServer
			await SyncService.updateExistingFileOnServer(
				driveClient.user,
				driveClient.client,
				existingFileData.fileId,
				{
					content: fileBuffer.toString('base64'),
					hash: newHash,
					clientFileId: driveFile.id,
					clientLastModified: driveFile.modifiedTime
				}
			);
			
			console.log(`[GDRIVE] Zaktualizowano plik z Google Drive: ${driveFile.name}`);
			
			return {
				fileId: existingFileData.fileId,
				operation: 'updated_from_drive',
				clientFileId: driveFile.id
			};
			
		} finally {
			this._cleanupTempFile(tempPath);
		}
	}
    
    async _createNewFile(driveClient, driveFile, folderId) {
		const syncDirection = driveClient.syncSettings?.syncDirection;
		
		if (syncDirection === 'upload-only') {
			console.log(`[GDRIVE] Tryb upload-only - pomijanie pobierania ${driveFile.name}`);
			return null;
		}
		
		// POPRAWKA: Sprawdź czy plik o tej nazwie i podobnym rozmiarze już istnieje na serwerze
		const existingFiles = await SyncService.findFileByNameAndHash(
			driveClient.user, 
			folderId, 
			driveFile.name, 
			null // Nie mamy jeszcze hash, więc sprawdzamy tylko nazwę
		);
		
		if (existingFiles.length > 0) {
			console.log(`[GDRIVE] Plik ${driveFile.name} już istnieje na serwerze - sprawdzam czy wymaga aktualizacji`);
			
			// Jeśli istnieje, sprawdź czy potrzebuje aktualizacji
			const existingFile = existingFiles[0];
			return await this._updateExistingFile(driveClient, driveFile, {
				fileId: existingFile.fileId,
				file: existingFile,
				clientFileId: driveFile.id,
				clientLastModified: driveFile.modifiedTime,
				hash: existingFile.hash
			});
		}
		
		const tempPath = await this._downloadDriveFile(driveClient, driveFile);
		
		try {
			const fileBuffer = fs.readFileSync(tempPath);
			const hash = await generateFileHash(tempPath);
			
			// POPRAWKA: Sprawdź ponownie po wygenerowaniu hash
			const existingByHash = await SyncService.findFileByNameAndHash(
				driveClient.user, 
				folderId, 
				driveFile.name, 
				hash
			);
			
			if (existingByHash.length > 0) {
				console.log(`[GDRIVE] Plik ${driveFile.name} z identycznym hash już istnieje - aktualizuję tylko metadane`);
				
				await SyncService.confirmFileDownloaded(
					driveClient.user,
					driveClient.client,
					existingByHash[0].fileId,
					{
						clientFileId: driveFile.id,
						clientFileName: driveFile.name,
						clientPath: null,
						clientLastModified: driveFile.modifiedTime
					}
				);
				
				return {
					fileId: existingByHash[0].fileId,
					operation: 'linked_existing',
					clientFileId: driveFile.id
				};
			}
			
			const uploadResult = await SyncService.uploadNewFileToServer(
				driveClient.user,
				driveClient.client,
				folderId,
				{
					name: driveFile.name,
					content: fileBuffer.toString('base64'),
					hash: hash,
					clientFileId: driveFile.id,
					clientLastModified: driveFile.modifiedTime
				}
			);
			
			console.log(`[GDRIVE] Pobrano nowy plik z Google Drive: ${driveFile.name}`);
			
			return {
				fileId: uploadResult.fileId,
				operation: 'downloaded_from_drive',
				clientFileId: driveFile.id
			};
			
		} finally {
			this._cleanupTempFile(tempPath);
		}
	}
    
    // === OPERACJE NA PLIKACH GOOGLE DRIVE ===
    
    // POPRAWIONA metoda - tylko listuje pliki bez pobierania
    async _listDriveFiles(driveClient, driveFolderId) {
        const drive = await GoogleDriveConnectionService.getDriveInstance(driveClient.user);
        
        const response = await drive.files.list({
            q: `'${driveFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
            pageSize: 1000,
            fields: 'files(id, name, size, createdTime, modifiedTime, mimeType)'
        });
        
        return response.data.files;
    }
    
    async _downloadDriveFile(driveClient, driveFile) {
        const drive = await GoogleDriveConnectionService.getDriveInstance(driveClient.user);
        const tempPath = this._getTempFilePath(driveFile.name);
        
        const response = await drive.files.get({
            fileId: driveFile.id,
            alt: 'media'
        }, { responseType: 'stream' });
        
        const fileStream = fs.createWriteStream(tempPath);
        
        await new Promise((resolve, reject) => {
            response.data.pipe(fileStream);
            response.data.on('error', reject);
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });
        
        return tempPath;
    }
	
	async _detectDeletedFromDrive(driveClient, syncData, driveFileList, folderId) {
		const operations = [];
		const driveFileIds = new Set(driveFileList.map(f => f.id));
		
		const filesWithClientId = syncData.filter(fileData => 
			fileData.clientFileId && 
			fileData.operation !== 'deleted' &&
			!driveFileIds.has(fileData.clientFileId)
		);
		
		for (const fileData of filesWithClientId) {
			console.log(`[GDRIVE] Plik ${fileData.file?.originalName || 'BRAK_NAZWY'} usunięty z Google Drive - usuwam z serwera`);
			
			try {
				// POPRAWKA: Zmiana na deleteFileFromServer
				await SyncService.deleteFileFromServer(
					driveClient.user,
					driveClient.client,
					fileData.fileId
				);
				
				operations.push({
					fileId: fileData.fileId,
					operation: 'deleted_from_server',
					fileName: fileData.file?.originalName || 'BRAK_NAZWY',
					reason: 'deleted_from_drive'
				});
				
				console.log(`[GDRIVE] ✓ Usunięto plik z serwera: ${fileData.file?.originalName}`);
				
			} catch (error) {
				console.error(`[GDRIVE] ✗ Błąd usuwania pliku z serwera ${fileData.file?.originalName}:`, error.message);
				operations.push({
					fileId: fileData.fileId,
					operation: 'error',
					error: error.message,
					fileName: fileData.file?.originalName || 'BRAK_NAZWY'
				});
			}
		}
		
		return operations;
	}
    
    // === METODY POMOCNICZE ===
    
    async _saveToTempFile(fileName, base64Content) {
        const tempPath = this._getTempFilePath(fileName);
        const buffer = Buffer.from(base64Content, 'base64');
        fs.writeFileSync(tempPath, buffer);
        return tempPath;
    }
    
    _getTempFilePath(fileName) {
        const tempDir = process.env.TEMP_DIR || os.tmpdir();
        const sanitizedName = fileName.replace(/[<>:"/\\|?*]/g, '_');
        
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        return path.join(tempDir, `gdrive_${Date.now()}_${sanitizedName}`);
    }
    
    _cleanupTempFile(tempPath) {
        if (fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
            } catch (error) {
                console.error(`[GDRIVE] Błąd usuwania pliku tymczasowego: ${error.message}`);
            }
        }
    }
    
    // === KONFIGURACJA I WALIDACJA ===
    
    async _validateDriveFolder(drive, driveFolderId) {
        const driveFolder = await drive.files.get({
            fileId: driveFolderId,
            fields: 'id, name, mimeType'
        });
        
        if (driveFolder.data.mimeType !== 'application/vnd.google-apps.folder') {
            throw new Error('Podany ID nie odpowiada folderowi Google Drive');
        }
    }
    
    async _getDriveFolderId(driveClient, folderId) {
        const clientConfig = await this._getClientFolderConfig(driveClient, folderId);
        return clientConfig.clientFolderId;
    }
    
    async _getActiveSyncFolders(driveClient) {
		const SyncFolder = require('../models/SyncFolder');
		const Client = require('../models/Client');
		
		const clientDoc = await Client.findOne({
			user: driveClient.user,
			_id: driveClient.client,
			isActive: true
		});
		
		if (!clientDoc) {
			console.log(`[GDRIVE] Nie znaleziono aktywnego klienta: user=${driveClient.user}, client=${driveClient.client}`);
			return [];
		}
		
		const syncFolders = await SyncFolder.find({
			user: driveClient.user,
			'clients.client': clientDoc._id,
			'clients.isActive': true
		});
		
		console.log(`[GDRIVE] Znaleziono ${syncFolders.length} folderów do synchronizacji dla klienta ${clientDoc._id}`);
		
		return syncFolders;
	}
    
    async _getClientFolderConfig(driveClient, folderId) {
		const SyncFolder = require('../models/SyncFolder');
		const Client = require('../models/Client');
		
		const clientDoc = await Client.findOne({
			user: driveClient.user,
			_id: driveClient.client, // ZMIANA: _id zamiast clientId
			isActive: true
		});
		
		if (!clientDoc) {
			console.log(`[GDRIVE] Klient nie został znaleziony: user=${driveClient.user}, client=${driveClient.client}`);
			throw new Error('Klient Google Drive nie został znaleziony');
		}
		
		const syncFolder = await SyncFolder.findOne({
			user: driveClient.user,
			folder: folderId,
			'clients.client': clientDoc._id
		});
		
		if (!syncFolder) {
			console.log(`[GDRIVE] SyncFolder nie został znaleziony: user=${driveClient.user}, folder=${folderId}, client=${clientDoc._id}`);
			throw new Error('Konfiguracja synchronizacji Google Drive nie została znaleziona');
		}
		
		const clientConfig = syncFolder.clients.find(c => 
			c.client.toString() === clientDoc._id.toString() // POPRAWKA: porównanie z clientDoc._id
		);
		
		if (!clientConfig) {
			console.log(`[GDRIVE] ClientConfig nie został znaleziony w syncFolder dla klienta ${clientDoc._id}`);
			throw new Error('Konfiguracja klienta Google Drive nie została znaleziona');
		}
		
		return clientConfig;
	}
    
    // POPRAWIONA metoda - używa danych z SyncService
    async _findExistingFileInSync(driveClient, driveFileId, folderId) {
        // Pobierz stan synchronizacji z SyncService
        const syncState = await SyncService.getSyncData(
			driveClient.user, 
			driveClient.client, 
			folderId
		);
        
        // Znajdź plik po clientFileId
        const existingFile = syncState.syncData.find(fileData => 
            fileData.clientFileId === driveFileId
        );
        
        return existingFile || null;
    }
	
	async _verifyFileExistsInDrive(driveClient, driveFileId) {
		try {
			const drive = await GoogleDriveConnectionService.getDriveInstance(driveClient.user);
			
			await drive.files.get({
				fileId: driveFileId,
				fields: 'id, name, trashed'
			});
			
			return true;
		} catch (error) {
			if (error.response?.status === 404) {
				console.log(`[GDRIVE] Plik ${driveFileId} nie istnieje w Google Drive`);
				return false;
			}
			// Jeśli to inny błąd (np. brak uprawnień), traktuj jako istniejący
			console.warn(`[GDRIVE] Błąd sprawdzania istnienia pliku ${driveFileId}:`, error.message);
			return true;
		}
	}
}

module.exports = new GoogleDriveSyncService();