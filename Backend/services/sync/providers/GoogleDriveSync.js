const SyncInterface = require('../SyncInterface');
const { generateFileHash, getCategoryFromMimeType } = require('../../../utils/fileUtils');
const { google } = require('googleapis');
const User = require('../../../models/User');
const Folder = require('../../../models/Folder');
const File = require('../../../models/File');
const SyncPair = require('../../../models/SyncPair');
const path = require('path');
const fs = require('fs');

class GoogleDriveSync extends SyncInterface {
    constructor(userId) {
        super(userId);
        this.drive = null;
        this.oauth2Client = null;
    }

    async initialize() {
        const user = await User.findById(this.userId);
        if (!user || !user.googleDriveTokens) {
            throw new Error('Brak autoryzacji Google Drive');
        }

        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        this.oauth2Client.setCredentials(user.googleDriveTokens);
        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });

        // Sprawdź i odśwież token jeśli potrzeba
        await this.ensureValidToken();
    }

    async ensureValidToken() {
        try {
            // Sprawdź czy token jest prawidłowy
            await this.drive.about.get({ fields: 'user' });
        } catch (error) {
            if (error.code === 401 || error.message.includes('invalid_grant')) {
                console.log('Token wygasł, próba odświeżenia...');
                await this.refreshToken();
            } else {
                throw error;
            }
        }
    }

    async refreshToken() {
        try {
            // Sprawdź czy mamy refresh token
            const user = await User.findById(this.userId);
            if (!user.googleDriveTokens || !user.googleDriveTokens.refresh_token) {
                throw new Error('Brak refresh token - wymagana ponowna autoryzacja');
            }

            console.log('Odświeżanie tokenu Google Drive...');
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            
            // Zachowaj refresh token jeśli nie został zwrócony nowy
            if (!credentials.refresh_token && user.googleDriveTokens.refresh_token) {
                credentials.refresh_token = user.googleDriveTokens.refresh_token;
            }

            this.oauth2Client.setCredentials(credentials);

            // Zapisz nowy token w bazie
            await User.findByIdAndUpdate(this.userId, {
                googleDriveTokens: credentials
            });

            console.log('Token odświeżony pomyślnie');
        } catch (error) {
            console.error('Błąd odświeżania tokenu:', error);
            
            // Jeśli odświeżenie się nie powiodło, wyczyść tokeny
            await User.findByIdAndUpdate(this.userId, {
                googleDriveEnabled: false,
                googleDriveTokens: null
            });
            
            throw new Error('Token wygasł - wymagana ponowna autoryzacja');
        }
    }

    async checkConnection() {
        try {
            await this.ensureValidToken();
            const response = await this.drive.about.get({ fields: 'user' });
            return { connected: true, user: response.data.user };
        } catch (error) {
            console.error('Błąd sprawdzania połączenia:', error);
            return { connected: false, error: error.message };
        }
    }

    async disconnect() {
        try {
            // Deaktywuj wszystkie pary synchronizacji tego providera
            await SyncPair.updateMany(
                { user: this.userId, provider: 'google-drive' },
                { isActive: false }
            );

            // Usuń tokeny z bazy danych
            await User.findByIdAndUpdate(this.userId, {
                googleDriveEnabled: false,
                googleDriveTokens: null
            });

            return { success: true };
        } catch (error) {
            throw new Error('Błąd rozłączania Google Drive: ' + error.message);
        }
    }

    async getExternalFolders(parentId = null) {
        try {
            await this.ensureValidToken();
            
            const query = parentId 
                ? `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
                : `parents in 'root' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

            const response = await this.drive.files.list({
                q: query,
                fields: 'files(id, name, parents)',
                pageSize: 100
            });

            return response.data.files.map(folder => ({
                id: folder.id,
                name: folder.name,
                path: folder.name,
                parentId: folder.parents ? folder.parents[0] : null
            }));
        } catch (error) {
            console.error('Błąd pobierania folderów:', error);
            
            // Jeśli to błąd autoryzacji, wyczyść połączenie
            if (error.code === 401 || error.message.includes('invalid_grant')) {
                await this.disconnect();
                throw new Error('Autoryzacja wygasła - wymagane ponowne połączenie');
            }
            
            throw new Error('Błąd pobierania folderów z Google Drive: ' + error.message);
        }
    }

    async createSyncPair(localFolderId, externalFolderId, syncDirection = 'bidirectional') {
        try {
            await this.ensureValidToken();
            
            // Sprawdź czy folder lokalny istnieje
            const localFolder = await Folder.findOne({ _id: localFolderId, user: this.userId });
            if (!localFolder) {
                throw new Error('Lokalny folder nie znaleziony');
            }

            // Sprawdź czy folder na Google Drive istnieje
            const driveFolder = await this.drive.files.get({
                fileId: externalFolderId,
                fields: 'id, name, parents'
            });

            // Sprawdź czy para już istnieje
            const existingPair = await SyncPair.findOne({
                user: this.userId,
                localFolder: localFolderId,
                provider: 'google-drive'
            });

            if (existingPair) {
                throw new Error('Para synchronizacji już istnieje dla tego folderu');
            }

            // Utwórz nową parę synchronizacji
            const syncPair = new SyncPair({
                user: this.userId,
                localFolder: localFolderId,
                provider: 'google-drive',
                externalFolderId: externalFolderId,
                externalFolderName: driveFolder.data.name,
                syncDirection: syncDirection,
                isActive: true
            });

            await syncPair.save();
            return syncPair;
        } catch (error) {
            throw new Error('Błąd tworzenia pary synchronizacji: ' + error.message);
        }
    }


    async removeSyncPair(syncPairId) {
        try {
            const syncPair = await SyncPair.findOne({
                _id: syncPairId,
                user: this.userId,
                provider: 'google-drive'
            });

            if (!syncPair) {
                throw new Error('Para synchronizacji nie znaleziona');
            }

            await SyncPair.findByIdAndDelete(syncPairId);
            return { success: true };
        } catch (error) {
            throw new Error('Błąd usuwania pary synchronizacji: ' + error.message);
        }
    }

    async syncFolder(syncPairId) {
        try {
            const syncPair = await SyncPair.findOne({
                _id: syncPairId,
                user: this.userId,
                provider: 'google-drive',
                isActive: true
            }).populate('localFolder');

            if (!syncPair) {
                throw new Error('Para synchronizacji nie znaleziona');
            }

            const result = {
                syncPairId: syncPairId,
                localFolder: syncPair.localFolder.name,
                externalFolder: syncPair.externalFolderName,
                direction: syncPair.syncDirection,
                filesTransferred: 0,
                errors: []
            };

            // Synchronizacja w zależności od kierunku
            if (syncPair.syncDirection === 'bidirectional' || syncPair.syncDirection === 'from-external') {
                await this.syncFromDrive(syncPair, result);
            }

            if (syncPair.syncDirection === 'bidirectional' || syncPair.syncDirection === 'to-external') {
                await this.syncToDrive(syncPair, result);
            }

            // Aktualizuj statystyki synchronizacji
            syncPair.lastSyncDate = new Date();
            syncPair.syncStats.totalSyncs += 1;
            if (result.errors.length === 0) {
                syncPair.syncStats.successfulSyncs += 1;
            } else {
                syncPair.syncStats.failedSyncs += 1;
                syncPair.syncStats.lastError = result.errors[0];
            }
            syncPair.syncStats.filesTransferred += result.filesTransferred;

            await syncPair.save();

            return result;
        } catch (error) {
            throw new Error('Błąd synchronizacji folderu: ' + error.message);
        }
    }

    async syncFromDrive(syncPair, result) {
		try {
			// Pobierz pliki z Google Drive
			const driveFiles = await this.drive.files.list({
				q: `'${syncPair.externalFolderId}' in parents and trashed=false`,
				fields: 'files(id, name, mimeType, size, modifiedTime, md5Checksum)',
				pageSize: 100
			});

			// Pobierz lokalne pliki zsynchronizowane z tego folderu
			const localFiles = await File.find({
				user: this.userId,
				folder: syncPair.localFolder,
				googleDriveId: { $exists: true },
				isDeleted: false
			});

			const driveFileIds = driveFiles.data.files.map(f => f.id);
			const localFileIds = localFiles.map(f => f.googleDriveId);

			// ZMIANA: Wykryj usunięte pliki na Google Drive, ale pomiń przywrócone
			if (syncPair.deleteSync.enabled && 
				['bidirectional', 'from-external'].includes(syncPair.deleteSync.deleteDirection)) {
				
				for (const localFile of localFiles) {
					if (!driveFileIds.includes(localFile.googleDriveId)) {
						// NOWA LOGIKA: Sprawdź czy plik został przywrócony
						if (localFile.restoredFromTrash) {
							console.log(`Plik ${localFile.originalName} został przywrócony - pomijam usuwanie`);
							// Oznacz że plik wymaga ponownego uploadu do Drive
							localFile.syncedToDrive = false;
							localFile.restoredFromTrash = false; // Resetuj flagę
							await localFile.save();
							continue;
						}
						
						await this.deleteLocalFile(localFile, syncPair, result);
					}
				}
			}

            // Synchronizuj pliki z Google Drive
            for (const driveFile of driveFiles.data.files) {
                try {
                    const existingFile = await File.findOne({
                        user: this.userId,
                        folder: syncPair.localFolder,
                        googleDriveId: driveFile.id,
                        isDeleted: false
                    });

                    if (!existingFile) {
                        await this.downloadFileFromDrive(driveFile, syncPair, result);
                    } else {
                        // Sprawdź czy plik został zmodyfikowany
                        await this.checkFileModification(driveFile, existingFile, syncPair, result);
                    }
                } catch (error) {
                    result.errors.push(`Błąd synchronizacji pliku ${driveFile.name}: ${error.message}`);
                }
            }
        } catch (error) {
            result.errors.push('Błąd pobierania z Google Drive: ' + error.message);
        }
    }

    async syncToDrive(syncPair, result) {
        try {
            // Pobierz lokalne pliki z folderu
            const localFiles = await File.find({
                user: this.userId,
                folder: syncPair.localFolder,
                isDeleted: false
            });

            // Pobierz pliki z Google Drive dla porównania
            const driveFiles = await this.drive.files.list({
                q: `'${syncPair.externalFolderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType, size, modifiedTime)',
                pageSize: 100
            });

            const driveFileNames = driveFiles.data.files.map(f => f.name);
            const localFileNames = localFiles.map(f => f.originalName);

            // Wykryj usunięte pliki lokalnie
            if (syncPair.deleteSync.enabled && 
                ['bidirectional', 'to-external'].includes(syncPair.deleteSync.deleteDirection)) {
                
                for (const driveFile of driveFiles.data.files) {
                    const localFile = localFiles.find(lf => lf.googleDriveId === driveFile.id);
                    if (!localFile || localFile.isDeleted) {
                        await this.deleteFileFromDrive(driveFile.id, syncPair, result);
                    }
                }
            }

            // Upload nowych plików ORAZ przywróconych
			for (const localFile of localFiles) {
				try {
					// ZMIANA: Upload jeśli brak googleDriveId LUB jest oznaczony jako nie zsynchronizowany
					if (!localFile.googleDriveId || !localFile.syncedToDrive) {
						await this.uploadFileToDrive(localFile, syncPair, result);
					}
				} catch (error) {
					result.errors.push(`Błąd uploadu pliku ${localFile.originalName}: ${error.message}`);
				}
			}

            // Synchronizuj usunięte pliki
            await this.syncDeletedFiles(syncPair, result);

        } catch (error) {
            result.errors.push('Błąd wysyłania do Google Drive: ' + error.message);
        }
    }
	
	async deleteLocalFile(localFile, syncPair, result) {
        try {


            // Oznacz jako usunięty w bazie danych (soft delete)
            localFile.isDeleted = true;
            localFile.deletedAt = new Date();
            localFile.deletedBy = 'sync';
            await localFile.save();

            result.filesTransferred += 1;
            console.log(`Usunięto lokalny plik: ${localFile.originalName}`);
        } catch (error) {
            throw new Error(`Błąd usuwania lokalnego pliku: ${error.message}`);
        }
    }

    async deleteFileFromDrive(driveFileId, syncPair, result) {
        try {
            await this.drive.files.delete({
                fileId: driveFileId
            });

            // Znajdź i oznacz lokalny plik jako usunięty
            const localFile = await File.findOne({
                user: this.userId,
                googleDriveId: driveFileId,
                isDeleted: false
            });

            if (localFile) {
                localFile.isDeleted = true;
                localFile.deletedAt = new Date();
                localFile.deletedBy = 'sync';
                await localFile.save();
            }

            result.filesTransferred += 1;
            console.log(`Usunięto plik z Google Drive: ${driveFileId}`);
        } catch (error) {
            throw new Error(`Błąd usuwania pliku z Google Drive: ${error.message}`);
        }
    }

    async checkFileModification(driveFile, localFile, syncPair, result) {
        try {
            const driveModified = new Date(driveFile.modifiedTime);
            const localModified = localFile.lastModified || localFile.createdAt;

            // Jeśli plik na Drive jest nowszy, pobierz go ponownie
            if (driveModified > localModified) {
                // Usuń stary plik
                const oldFilePath = path.resolve(process.env.UPLOADS_DIR, localFile.path);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }

                // Pobierz nową wersję
                await this.downloadFileFromDrive(driveFile, syncPair, result, localFile);
            }
        } catch (error) {
            console.error('Błąd sprawdzania modyfikacji pliku:', error);
        }
    }

    async syncDeletedFiles(syncPair, result) {
        try {
            // Znajdź lokalne pliki oznaczone do usunięcia, które nie zostały jeszcze przetworzone
            const deletedLocalFiles = await File.find({
                user: this.userId,
                folder: syncPair.localFolder,
                isDeleted: true,
                deletedBy: 'user',
                googleDriveId: { $exists: true }
            });

            for (const deletedFile of deletedLocalFiles) {
                if (syncPair.deleteSync.enabled && 
                    ['bidirectional', 'to-external'].includes(syncPair.deleteSync.deleteDirection)) {
                    
                    try {
                        await this.drive.files.delete({
                            fileId: deletedFile.googleDriveId
                        });

                        // Oznacz jako przetworzone
                        deletedFile.deletedBy = 'sync';
                        await deletedFile.save();

                        result.filesTransferred += 1;
                    } catch (error) {
                        if (error.code !== 404) { // Ignoruj jeśli plik już nie istnieje
                            result.errors.push(`Błąd usuwania z Drive: ${error.message}`);
                        }
                    }
                }
            }
        } catch (error) {
            result.errors.push('Błąd synchronizacji usuniętych plików: ' + error.message);
        }
    }

    async downloadFileFromDrive(driveFile, syncPair, result, existingFile = null) {
    // Pomiń foldery Google Apps
    if (driveFile.mimeType === 'application/vnd.google-apps.folder') {
        return;
    }

    const category = getCategoryFromMimeType(driveFile.mimeType);
    const uploadDir = path.resolve(process.env.UPLOADS_DIR, category);
    fs.mkdirSync(uploadDir, { recursive: true });

    const uniqueName = Date.now() + '-' + driveFile.name;
    const filePath = path.join(uploadDir, uniqueName);

    // Pobierz plik z Google Drive
    const response = await this.drive.files.get({
        fileId: driveFile.id,
        alt: 'media'
    }, { responseType: 'stream' });

    // Zapisz plik lokalnie
    const writeStream = fs.createWriteStream(filePath);
    response.data.pipe(writeStream);

    await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
    });

    // Oblicz hash pliku używając wspólnej funkcji
    const fileHash = await generateFileHash(filePath);

    if (existingFile) {
        // Aktualizuj istniejący plik
        existingFile.path = path.join(category, uniqueName).replace(/\\/g, '/');
        existingFile.fileHash = fileHash;
        existingFile.lastModified = new Date(driveFile.modifiedTime);
        existingFile.lastSyncDate = new Date();
        await existingFile.save();
    } else {
        // Utwórz nowy rekord w bazie danych
        const file = new File({
            user: this.userId,
            path: path.join(category, uniqueName).replace(/\\/g, '/'),
            originalName: driveFile.name,
            mimetype: driveFile.mimeType,
            category: category,
            folder: syncPair.localFolder,
            googleDriveId: driveFile.id,
            syncedFromDrive: true,
            fileHash: fileHash,
            lastModified: new Date(driveFile.modifiedTime),
            lastSyncDate: new Date()
        });

        await file.save();
    }
    
    result.filesTransferred += 1;
}

    async uploadFileToDrive(localFile, syncPair, result) {
        const filePath = path.resolve(process.env.UPLOADS_DIR, localFile.path);
        
        // Sprawdź czy plik istnieje
        if (!fs.existsSync(filePath)) {
            throw new Error('Lokalny plik nie istnieje');
        }

        const fileMetadata = {
            name: localFile.originalName,
            parents: [syncPair.externalFolderId]
        };

        const media = {
            mimeType: localFile.mimetype,
            body: fs.createReadStream(filePath)
        };

        const response = await this.drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        });

        // Aktualizuj rekord w bazie danych
        localFile.googleDriveId = response.data.id;
        localFile.syncedToDrive = true;
        localFile.lastSyncDate = new Date();
        await localFile.save();

        result.filesTransferred += 1;
    }

    async syncAllPairs() {
        const syncPairs = await SyncPair.find({
            user: this.userId,
            provider: 'google-drive',
            isActive: true
        });

        const results = [];
        for (const syncPair of syncPairs) {
            try {
                const result = await this.syncFolder(syncPair._id);
                results.push(result);
            } catch (error) {
                results.push({
                    syncPairId: syncPair._id,
                    error: error.message
                });
            }
        }

        return results;
    }

    static getAuthUrl(state) {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        const scopes = process.env.GOOGLE_API_SCOPE.split(',');

        return oauth2Client.generateAuthUrl({
            access_type: 'offline', // Ważne: wymusza refresh token
            prompt: 'consent',      // Wymusza ponowną zgodę (gwarantuje refresh token)
            scope: scopes,
            state: state
        });
    }

    static async handleAuthCallback(userId, params) {
        const { code } = params;

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        try {
            const { tokens } = await oauth2Client.getToken(code);
            
            // Sprawdź czy otrzymaliśmy refresh token
            if (!tokens.refresh_token) {
                console.warn('Nie otrzymano refresh token - może być wymagana ponowna autoryzacja');
            }

            // Zapisz tokeny w bazie danych
            await User.findByIdAndUpdate(userId, {
                googleDriveTokens: tokens,
                googleDriveEnabled: true
            });

            return { success: true };
        } catch (error) {
            console.error('Błąd autoryzacji:', error);
            throw new Error('Błąd autoryzacji Google Drive: ' + error.message);
        }
    }
}

module.exports = GoogleDriveSync;