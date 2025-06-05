const { google } = require('googleapis');
const GoogleDriveClient = require('../models/GoogleDriveClient');
const File = require('../models/File');
const Folder = require('../models/Folder');
const fs = require('fs');
const path = require('path');
const { generateFileHash, getCategoryFromMimeType } = require('../utils/fileUtils');

class GoogleDriveService {
    
    constructor() {
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
    }
    
    // === AUTORYZACJA ===
    
    getAuthUrl(userId) {
		const scopes = process.env.GOOGLE_API_SCOPE.split(',');
		return this.oauth2Client.generateAuthUrl({
			access_type: 'offline', // WAŻNE: musi być 'offline'
			scope: scopes,
			state: userId,
			prompt: 'consent', // Wymusza zgodę użytkownika
			include_granted_scopes: true // Dodatkowa opcja
		});
	}
    
    async handleAuthCallback(code, userId, connectionName) {
		try {
						
			// Pobierz token za pomocą kodu autoryzacyjnego
			const { tokens } = await this.oauth2Client.getToken(code);
			
			// KRYTYCZNE: Ustaw credentials w oauth2Client
			this.oauth2Client.setCredentials(tokens);
			
			
			// Utwórz drive API z właściwie skonfigurowanym auth
			const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
			
			// Testowe zapytanie - pobierz informacje o użytkowniku z Drive API
			const aboutResponse = await drive.about.get({ fields: 'user' });
			
			// Jeśli drive API działa, sprawdź oauth2 API
			const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
			const userInfo = await oauth2.userinfo.get();
			
			// Zapisz lub zaktualizuj klienta Google Drive
			let driveClient = await GoogleDriveClient.findOne({ user: userId });
			
			if (driveClient) {
				driveClient.credentials = tokens;
				driveClient.googleUser = userInfo.data;
				driveClient.name = connectionName || driveClient.name;
				driveClient.status.isConnected = true;
				driveClient.status.lastError = null;
			} else {
				driveClient = new GoogleDriveClient({
					user: userId,
					name: connectionName || 'Google Drive',
					credentials: tokens,
					googleUser: userInfo.data
				});
			}
			
			await driveClient.save();
			
			return driveClient;
			
		} catch (error) {
			throw new Error('Błąd podczas autoryzacji z Google Drive: ' + error.message);
		}
	}
    
    // === OPERACJE NA PLIKACH GOOGLE DRIVE ===
    
    async getDriveInstance(userId) {
        const driveClient = await GoogleDriveClient.findOne({ user: userId });
        if (!driveClient || !driveClient.status.isConnected) {
            throw new Error('Brak aktywnego połączenia z Google Drive');
        }
        
        // Sprawdź czy token nie wygasł
        if (driveClient.isTokenExpired()) {
            await this.refreshToken(driveClient);
        }
        
        // Stwórz nową instancję OAuth2Client z aktualnymi credentials
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        
        oauth2Client.setCredentials(driveClient.credentials);
        
        return google.drive({ version: 'v3', auth: oauth2Client });
    }
    
    async refreshToken(driveClient) {
        try {
            // Stwórz nową instancję OAuth2Client
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                process.env.GOOGLE_REDIRECT_URI
            );
            
            oauth2Client.setCredentials(driveClient.credentials);
            const { credentials } = await oauth2Client.refreshAccessToken();
            
            driveClient.credentials = credentials;
            await driveClient.save();
        } catch (error) {
            driveClient.status.isConnected = false;
            driveClient.status.lastError = 'Token refresh failed';
            await driveClient.save();
            throw new Error('Błąd odświeżania tokena Google Drive');
        }
    }
    
    async listDriveFolders(userId, parentId = 'root') {
        try {
            const drive = await this.getDriveInstance(userId);
            
            const response = await drive.files.list({
                q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                pageSize: 100,
                fields: 'files(id, name, parents, createdTime, modifiedTime)'
            });
            
            return response.data.files;
        } catch (error) {
            console.error('Błąd pobierania folderów Google Drive:', error);
            throw new Error('Błąd pobierania folderów z Google Drive');
        }
    }
    
    async createDriveFolder(userId, name, parentId = 'root') {
        try {
            const drive = await this.getDriveInstance(userId);
            
            const fileMetadata = {
                name: name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            };
            
            const response = await drive.files.create({
                resource: fileMetadata,
                fields: 'id, name, parents'
            });
            
            return response.data;
        } catch (error) {
            console.error('Błąd tworzenia folderu Google Drive:', error);
            throw new Error('Błąd tworzenia folderu w Google Drive');
        }
    }
    
    async uploadFile(userId, localFilePath, fileName, driveFolderId) {
        try {
            const drive = await this.getDriveInstance(userId);
            
            const fileMetadata = {
                'name': fileName,
                'parents': [driveFolderId]
            };
            
            const media = {
                body: fs.createReadStream(localFilePath)
            };
            
            const response = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, name, size, createdTime, modifiedTime'
            });
            
            return response.data;
        } catch (error) {
            console.error('Błąd uploadu pliku do Google Drive:', error);
            throw new Error('Błąd wysyłania pliku do Google Drive');
        }
    }
    
    async downloadFile(userId, driveFileId, localPath) {
		try {
			const drive = await this.getDriveInstance(userId);
			
			const response = await drive.files.get({
				fileId: driveFileId,
				alt: 'media'
			}, { responseType: 'stream' });
			
			const writer = fs.createWriteStream(localPath);
			
			return new Promise((resolve, reject) => {
				response.data.on('error', reject);
				writer.on('error', reject);
				writer.on('finish', resolve);
				
				response.data.pipe(writer);
			});
		} catch (error) {
			console.error('Błąd pobierania pliku z Google Drive:', error);
			throw new Error('Błąd pobierania pliku z Google Drive');
		}
	}
	
	
	async deleteFile(userId, driveFileId) {
        try {
            const drive = await this.getDriveInstance(userId);
            
            await drive.files.delete({
                fileId: driveFileId
            });
            
            return { success: true, deletedFileId: driveFileId };
        } catch (error) {
            console.error('Błąd usuwania pliku z Google Drive:', error);
            throw new Error('Błąd usuwania pliku z Google Drive');
        }
    }
    
    async deleteFolder(userId, driveFolderId) {
        try {
            const drive = await this.getDriveInstance(userId);
            
            await drive.files.delete({
                fileId: driveFolderId
            });
            
            return { success: true, deletedFolderId: driveFolderId };
        } catch (error) {
            console.error('Błąd usuwania folderu z Google Drive:', error);
            throw new Error('Błąd usuwania folderu z Google Drive');
        }
    }
    
    // === SYNCHRONIZACJA ===
    
    async syncFolderToDrive(userId, localFolderId, driveFolderId) {
        try {
            const startTime = Date.now();
            const driveClient = await GoogleDriveClient.findOne({ user: userId });
            
            if (!driveClient) {
                throw new Error('Brak połączenia z Google Drive');
            }
            
            if (!driveFolderId || driveFolderId === '' || driveFolderId === 'undefined') {
                console.error('BŁĄD: Nieprawidłowy driveFolderId:', driveFolderId);
                throw new Error('Nieprawidłowy identyfikator folderu Google Drive');
            }
            
            console.log(`SYNCHRONIZACJA: Lokalny folder ${localFolderId} -> Google Drive folder ${driveFolderId}`);
            
            // Sprawdź czy folder docelowy istnieje na Google Drive
            const drive = await this.getDriveInstance(userId);
            if (driveFolderId !== 'root') {
                const folderCheck = await drive.files.get({
                    fileId: driveFolderId,
                    fields: 'id, name, mimeType'
                });
                
                if (folderCheck.data.mimeType !== 'application/vnd.google-apps.folder') {
                    throw new Error('Podany ID nie jest folderem na Google Drive');
                }
            }
            
            driveClient.status.syncInProgress = true;
            await driveClient.save();
            
            // Pobierz pliki z Google Drive w tym folderze
            const driveFilesResponse = await drive.files.list({
                q: `'${driveFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
                pageSize: 1000,
                fields: 'files(id, name, size, createdTime, modifiedTime, mimeType)'
            });
            const driveFiles = driveFilesResponse.data.files;
            
            // Pobierz pliki lokalne
            const localFiles = await File.find({
                user: userId,
                folder: localFolderId,
                isDeleted: false
            });
            
            // Pobierz pliki lokalne oznaczone jako usunięte (ale jeszcze zsynchronizowane z tym folderem)
            const deletedLocalFiles = await File.find({
                user: userId,
                folder: localFolderId,
                isDeleted: true,
                'clientMappings.client': driveClient._id,
                'clientMappings.clientPath': driveFolderId,
                deletedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Ostatnie 7 dni
            });
            
            let uploadedCount = 0;
            let deletedCount = 0;
            const errors = [];
            
            // === OBSŁUGA USUWANIA PLIKÓW ===
            // Usuń pliki z Google Drive, które zostały usunięte lokalnie
            for (const deletedFile of deletedLocalFiles) {
                try {
                    const driveMapping = deletedFile.clientMappings.find(
                        m => m.client && m.client.toString() === driveClient._id.toString() && 
                             m.clientPath === driveFolderId
                    );
                    
                    if (driveMapping && driveMapping.clientFileId) {
                        console.log(`Usuwam plik ${deletedFile.originalName} z Google Drive (ID: ${driveMapping.clientFileId})`);
                        
                        await this.deleteFile(userId, driveMapping.clientFileId);
                        
                        // Usuń mapowanie z pliku
                        deletedFile.clientMappings = deletedFile.clientMappings.filter(
                            m => !(m.client.toString() === driveClient._id.toString() && m.clientPath === driveFolderId)
                        );
                        await deletedFile.save();
                        
                        deletedCount++;
                        console.log(`SUKCES: Plik ${deletedFile.originalName} usunięty z Google Drive`);
                    }
                } catch (error) {
                    console.error(`Błąd usuwania pliku ${deletedFile.originalName}:`, error);
                    errors.push({ file: deletedFile.originalName, error: error.message, action: 'delete' });
                }
            }
            
            // === OBSŁUGA DODAWANIA/AKTUALIZACJI PLIKÓW ===
            for (const file of localFiles) {
                try {
                    const driveMapping = file.clientMappings.find(
                        m => m.client && m.client.toString() === driveClient._id.toString() && 
                             m.clientPath === driveFolderId
                    );
                    
                    if (!driveMapping) {
                        console.log(`Przesyłam plik ${file.originalName} do folderu ${driveFolderId}`);
                        
                        const localPath = path.resolve(process.env.UPLOADS_DIR, file.path);
                        const driveFile = await this.uploadFile(userId, localPath, file.originalName, driveFolderId);
                        
                        console.log(`SUKCES: Plik ${file.originalName} przesłany - ID: ${driveFile.id}`);
                        
                        file.clientMappings.push({
                            client: driveClient._id,
                            clientFileId: driveFile.id,
                            clientFileName: driveFile.name,
                            clientPath: driveFolderId,
                            lastSyncDate: new Date()
                        });
                        
                        await file.save();
                        uploadedCount++;
                    } else {
                        console.log(`Plik ${file.originalName} już zsynchronizowany do folderu ${driveFolderId}`);
                    }
                } catch (error) {
                    console.error(`Błąd synchronizacji pliku ${file.originalName}:`, error);
                    errors.push({ file: file.originalName, error: error.message, action: 'upload' });
                }
            }
            
            const duration = Date.now() - startTime;
            driveClient.stats.filesUploaded += uploadedCount;
            await driveClient.updateSyncStatus(true, errors.length > 0 ? JSON.stringify(errors) : null, duration);
            
            console.log(`SYNCHRONIZACJA ZAKOŃCZONA: ${uploadedCount} plików przesłanych, ${deletedCount} plików usuniętych z folderu ${driveFolderId}`);
            
            return {
                success: true,
                uploadedCount,
                deletedCount,
                errors,
                duration,
                targetFolder: driveFolderId,
                message: `Synchronizacja zakończona: ${uploadedCount} plików przesłanych, ${deletedCount} plików usuniętych`
            };
            
        } catch (error) {
            console.error('Błąd synchronizacji do Google Drive:', error);
            const driveClient = await GoogleDriveClient.findOne({ user: userId });
            if (driveClient) {
                await driveClient.updateSyncStatus(false, error.message);
            }
            throw error;
        }
    }
    
    async syncFromDrive(userId, localFolderId, driveFolderId) {
        try {
            const drive = await this.getDriveInstance(userId);
            const driveClient = await GoogleDriveClient.findOne({ user: userId });
            
            // Pobierz pliki z Google Drive
            const response = await drive.files.list({
                q: `'${driveFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
                pageSize: 1000,
                fields: 'files(id, name, size, createdTime, modifiedTime, mimeType)'
            });
            const driveFiles = response.data.files;
            
            // Pobierz pliki lokalne zsynchronizowane z tym folderem Google Drive
            const localFiles = await File.find({
                user: userId,
                folder: localFolderId,
                isDeleted: false,
                'clientMappings.client': driveClient._id,
                'clientMappings.clientPath': driveFolderId
            });
            
            let downloadedCount = 0;
            let deletedCount = 0;
            const errors = [];
            
            // === OBSŁUGA USUWANIA PLIKÓW ===
            // Znajdź pliki lokalne, których już nie ma na Google Drive
            for (const localFile of localFiles) {
                const driveMapping = localFile.clientMappings.find(
                    m => m.client.toString() === driveClient._id.toString() && m.clientPath === driveFolderId
                );
                
                if (driveMapping) {
                    const driveFileExists = driveFiles.find(df => df.id === driveMapping.clientFileId);
                    
                    if (!driveFileExists) {
                        try {
                            console.log(`Plik ${localFile.originalName} nie istnieje już na Google Drive - oznaczam jako usunięty`);
                            
                            // Sprawdź czy to jedyne mapowanie - jeśli tak, usuń plik całkowicie
                            if (localFile.clientMappings.length === 1) {
                                localFile.isDeleted = true;
                                localFile.deletedAt = new Date();
                            } else {
                                // Usuń tylko mapowanie do Google Drive
                                localFile.clientMappings = localFile.clientMappings.filter(
                                    m => !(m.client.toString() === driveClient._id.toString() && m.clientPath === driveFolderId)
                                );
                            }
                            
                            await localFile.save();
                            deletedCount++;
                            
                        } catch (error) {
                            console.error(`Błąd usuwania pliku ${localFile.originalName}:`, error);
                            errors.push({ file: localFile.originalName, error: error.message, action: 'delete' });
                        }
                    }
                }
            }
            
            // === OBSŁUGA DODAWANIA/AKTUALIZACJI PLIKÓW ===
            for (const driveFile of driveFiles) {
                try {
                    const existingFile = await File.findOne({
                        user: userId,
                        folder: localFolderId,
                        'clientMappings.clientFileId': driveFile.id,
                        'clientMappings.clientPath': driveFolderId,
                        isDeleted: false
                    });
                    
                    if (!existingFile) {
                        const category = getCategoryFromMimeType(driveFile.mimeType);
                        const uploadDir = path.resolve(process.env.UPLOADS_DIR, category);
                        
                        if (!fs.existsSync(uploadDir)) {
                            fs.mkdirSync(uploadDir, { recursive: true });
                        }
                        
                        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(driveFile.name);
                        const localPath = path.join(uploadDir, uniqueName);
                        
                        await this.downloadFile(userId, driveFile.id, localPath);
                        
                        const file = new File({
                            user: userId,
                            path: path.join(category, uniqueName).replace(/\\/g, '/'),
                            originalName: driveFile.name,
                            mimetype: driveFile.mimeType,
                            size: parseInt(driveFile.size) || 0,
                            category: category,
                            folder: localFolderId,
                            fileHash: await generateFileHash(localPath),
                            lastModified: new Date(driveFile.modifiedTime),
                            clientMappings: [{
                                client: driveClient._id,
                                clientFileId: driveFile.id,
                                clientFileName: driveFile.name,
                                clientPath: driveFolderId,
                                lastSyncDate: new Date()
                            }]
                        });
                        
                        await file.save();
                        downloadedCount++;
                    }
                } catch (error) {
                    console.error(`Błąd pobierania pliku ${driveFile.name}:`, error);
                    errors.push({ file: driveFile.name, error: error.message, action: 'download' });
                }
            }
            
            driveClient.stats.filesDownloaded += downloadedCount;
            await driveClient.save();
            
            return {
                success: true,
                downloadedCount,
                deletedCount,
                errors
            };
            
        } catch (error) {
            console.error('Błąd synchronizacji z Google Drive:', error);
            throw error;
        }
    }
    
    // === HELPER METHODS ===
    
    async getConnectionStatus(userId) {
		const driveClient = await GoogleDriveClient.findOne({ user: userId });
		if (!driveClient) {
			return { connected: false };
		}
		
		return {
			connected: driveClient.status.isConnected,
			name: driveClient.name,
			googleUser: driveClient.googleUser,
			lastSync: driveClient.status.lastSync,
			stats: driveClient.stats,
			syncSettings: driveClient.syncSettings || {}
		};
	}
    
    async disconnect(userId) {
        const driveClient = await GoogleDriveClient.findOne({ user: userId });
        if (driveClient) {
            driveClient.status.isConnected = false;
            await driveClient.save();
        }
        return { success: true };
    }
    
    async autoSyncFolder(userId, localFolderId, googleDriveFolderId = null, forceSync = false) {
		try {
			const driveClient = await GoogleDriveClient.findOne({ user: userId });
			
			if (!driveClient || !driveClient.status.isConnected) {
				console.log('Google Drive nie jest połączony - pomijam synchronizację');
				return { skipped: true, reason: 'not_connected' };
			}
			
			// Sprawdź czy synchronizacja nie jest już w trakcie
			if (driveClient.status.syncInProgress) {
				console.log('Synchronizacja już w trakcie - pomijam');
				return { skipped: true, reason: 'sync_in_progress' };
			}
			
			// Sprawdź auto-sync tylko jeśli nie wymuszamy synchronizacji
			if (!forceSync && !driveClient.syncSettings.autoSync) {
				console.log('Auto-sync wyłączone - pomijam automatyczną synchronizację');
				return { skipped: true, reason: 'auto_sync_disabled' };
			}
			
			// KRYTYCZNE: Sprawdź konfigurację synchronizacji dla tego folderu
			const SyncFolder = require('../models/SyncFolder');
			const syncFolder = await SyncFolder.findOne({
				user: userId,
				localFolder: localFolderId
			});
			
			let targetDriveFolderId = googleDriveFolderId;
			
			// Jeśli nie podano folderu, sprawdź konfigurację synchronizacji
			if (!targetDriveFolderId && syncFolder && syncFolder.clients) {
				const googleDriveClient = syncFolder.clients.find(
					client => client.clientId === 'google-drive'
				);
				if (googleDriveClient && googleDriveClient.clientFolderId) {
					targetDriveFolderId = googleDriveClient.clientFolderId; // Zmienione z clientFolderPath
					console.log(`Znaleziono skonfigurowany folder Google Drive: ${targetDriveFolderId}`);
				}
			}
			
			// KRYTYCZNE: Nie używaj 'root' jako domyślnego - zgłoś błąd
			if (!targetDriveFolderId || targetDriveFolderId === '' || targetDriveFolderId === 'undefined') {
				console.error('BŁĄD: Brak skonfigurowanego folderu Google Drive dla synchronizacji');
				return { 
					success: false, 
					error: 'Brak skonfigurowanego folderu Google Drive - skonfiguruj synchronizację ponownie' 
				};
			}
			
			console.log(`AUTO-SYNC: Folder lokalny ${localFolderId} -> Google Drive ${targetDriveFolderId}`); // DEBUG
			
			// Wykonaj synchronizację w odpowiednim kierunku
			const results = {
				upload: null,
				download: null
			};
			
			// Domyślny kierunek synchronizacji jeśli nie jest ustawiony
			const syncDirection = driveClient.syncSettings.syncDirection || 'bidirectional';
			
			if (syncDirection === 'bidirectional' || syncDirection === 'upload-only') {
				results.upload = await this.syncFolderToDrive(userId, localFolderId, targetDriveFolderId);
			}
			
			if (syncDirection === 'bidirectional' || syncDirection === 'download-only') {
				results.download = await this.syncFromDrive(userId, localFolderId, targetDriveFolderId);
			}
			
			return {
				success: true,
				forced: forceSync,
				syncDirection: syncDirection,
				targetFolder: targetDriveFolderId,
				results
			};
			
		} catch (error) {
			console.error('Błąd synchronizacji Google Drive:', error);
			return {
				success: false,
				error: error.message
			};
		}
	}

	// Dodaj nową metodę dla ręcznej synchronizacji
	async manualSyncFolder(userId, localFolderId, googleDriveFolderId = null) {
		// Użyj autoSyncFolder z flagą forceSync=true
		return await this.autoSyncFolder(userId, localFolderId, googleDriveFolderId, true);
	}

    // Dodaj metodę do sprawdzenia czy Google Drive jest skonfigurowany
    async isGoogleDriveConfigured(userId) {
        const driveClient = await GoogleDriveClient.findOne({ user: userId });
        return driveClient && driveClient.status.isConnected && driveClient.syncSettings.autoSync;
    }
}

module.exports = new GoogleDriveService();