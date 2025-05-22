const SyncInterface = require('../SyncInterface');
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

        // Sprawdź czy token nie wygasł
        try {
            await this.drive.about.get({ fields: 'user' });
        } catch (error) {
            if (error.code === 401) {
                // Token wygasł, spróbuj odświeżyć
                await this.refreshToken();
            } else {
                throw error;
            }
        }
    }

    async refreshToken() {
        try {
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            this.oauth2Client.setCredentials(credentials);

            // Zapisz nowy token w bazie
            await User.findByIdAndUpdate(this.userId, {
                googleDriveTokens: credentials
            });
        } catch (error) {
            throw new Error('Nie można odświeżyć tokenu Google Drive');
        }
    }

    async checkConnection() {
        try {
            const response = await this.drive.about.get({ fields: 'user' });
            return { connected: true, user: response.data.user };
        } catch (error) {
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
                path: folder.name, // W przyszłości możemy budować pełną ścieżkę
                parentId: folder.parents ? folder.parents[0] : null
            }));
        } catch (error) {
            throw new Error('Błąd pobierania folderów z Google Drive: ' + error.message);
        }
    }

    async createSyncPair(localFolderId, externalFolderId, syncDirection = 'bidirectional') {
        try {
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
                fields: 'files(id, name, mimeType, size, modifiedTime)',
                pageSize: 100
            });

            for (const driveFile of driveFiles.data.files) {
                try {
                    // Sprawdź czy plik już istnieje lokalnie
                    const existingFile = await File.findOne({
                        user: this.userId,
                        folder: syncPair.localFolder,
                        googleDriveId: driveFile.id
                    });

                    if (!existingFile) {
                        await this.downloadFileFromDrive(driveFile, syncPair, result);
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
                syncedToDrive: { $ne: true }
            });

            for (const localFile of localFiles) {
                try {
                    await this.uploadFileToDrive(localFile, syncPair, result);
                } catch (error) {
                    result.errors.push(`Błąd uploadu pliku ${localFile.originalName}: ${error.message}`);
                }
            }
        } catch (error) {
            result.errors.push('Błąd wysyłania do Google Drive: ' + error.message);
        }
    }

    async downloadFileFromDrive(driveFile, syncPair, result) {
        // Pomiń foldery Google Apps
        if (driveFile.mimeType === 'application/vnd.google-apps.folder') {
            return;
        }

        const category = this.getCategoryFromMimeType(driveFile.mimeType);
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

        // Utwórz rekord w bazie danych
        const file = new File({
            user: this.userId,
            path: path.join(category, uniqueName).replace(/\\/g, '/'),
            originalName: driveFile.name,
            mimetype: driveFile.mimeType,
            category: category,
            folder: syncPair.localFolder,
            googleDriveId: driveFile.id,
            syncedFromDrive: true,
            lastSyncDate: new Date()
        });

        await file.save();
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

    getCategoryFromMimeType(mimetype) {
        if (mimetype.startsWith('image/')) return 'image';
        if (mimetype.startsWith('video/')) return 'video';
        if (mimetype.startsWith('audio/')) return 'audio';
        if (mimetype === 'application/pdf' || mimetype.startsWith('text/')) return 'document';
        return 'other';
    }

    static getAuthUrl(state) {
		const oauth2Client = new google.auth.OAuth2(
			process.env.GOOGLE_CLIENT_ID,
			process.env.GOOGLE_CLIENT_SECRET,
			process.env.GOOGLE_REDIRECT_URI
		);

		const scopes = process.env.GOOGLE_API_SCOPE.split(',');

		return oauth2Client.generateAuthUrl({
			access_type: 'offline',
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

		const { tokens } = await oauth2Client.getToken(code);

		// Zapisz tokeny w bazie danych
		await User.findByIdAndUpdate(userId, {
			googleDriveTokens: tokens,
			googleDriveEnabled: true
		});

		return { success: true };
	}
}

module.exports = GoogleDriveSync;