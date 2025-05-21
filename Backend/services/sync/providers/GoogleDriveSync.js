const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const SyncInterface = require('../SyncInterface');
const User = require('../../../models/User');
const Folder = require('../../../models/Folder');
const File = require('../../../models/File');
const { getCategoryFromMimeType } = require('../../utils/fileUtils');

class GoogleDriveSync extends SyncInterface {
    constructor(userId) {
        super(userId);
        this.oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );
        this.drive = null;
        this.user = null;
    }

    // Inicjalizacja połączenia z Google Drive
    async initialize() {
        this.user = await User.findById(this.userId);
        if (!this.user || !this.user.googleDriveTokens) {
            throw new Error('Użytkownik nie ma uprawnień do Google Drive');
        }

        this.oauth2Client.setCredentials(this.user.googleDriveTokens);
        
        // Sprawdzenie, czy token wymaga odświeżenia
        if (this.user.googleDriveTokens.expiry_date < Date.now()) {
            try {
                const { tokens } = await this.oauth2Client.refreshToken(
                    this.user.googleDriveTokens.refresh_token
                );
                this.user.googleDriveTokens = {
                    ...this.user.googleDriveTokens,
                    ...tokens
                };
                await this.user.save();
            } catch (error) {
                console.error('Błąd odświeżania tokena:', error);
                throw new Error('Błąd autoryzacji Google Drive');
            }
        }

        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    }

    // Sprawdzenie statusu połączenia
    async checkConnection() {
        if (!this.user || !this.user.googleDriveEnabled || !this.user.googleDriveTokens) {
            return { connected: false };
        }

        try {
            // Próba wykonania prostego zapytania, aby sprawdzić, czy tokeny działają
            await this.drive.about.get({ fields: 'user' });
            return {
                connected: true,
                lastSync: this.user.lastDriveSyncDate || null
            };
        } catch (error) {
            console.error('Błąd sprawdzania połączenia z Google Drive:', error);
            return { connected: false, error: error.message };
        }
    }

    // Rozłączenie z Google Drive
    async disconnect() {
        if (!this.user) {
            throw new Error('Użytkownik nie znaleziony');
        }

        this.user.googleDriveTokens = undefined;
        this.user.googleDriveEnabled = false;
        await this.user.save();

        return { success: true, message: 'Konto Google Drive odłączone' };
    }

    // Pobranie folderów z Google Drive i zapisanie w aplikacji
    async syncFoldersFrom() {
        try {
            // Pobierz wszystkie foldery z Google Drive
            const response = await this.drive.files.list({
                q: "mimeType='application/vnd.google-apps.folder'",
                fields: 'files(id, name, parents)',
                spaces: 'drive'
            });

            const driveFolders = response.data.files;
            const syncedFolders = [];

            // Mapowanie folderów Google Drive na foldery aplikacji
            for (const driveFolder of driveFolders) {
                // Sprawdź czy folder już istnieje w bazie
                let folder = await Folder.findOne({
                    user: this.userId,
                    googleDriveId: driveFolder.id
                });

                if (!folder) {
                    // Określenie rodzica folderu
                    let parent = null;
                    if (driveFolder.parents && driveFolder.parents.length > 0) {
                        const parentFolder = await Folder.findOne({
                            user: this.userId,
                            googleDriveId: driveFolder.parents[0]
                        });
                        if (parentFolder) {
                            parent = parentFolder._id;
                        }
                    }

                    // Utwórz nowy folder
                    folder = new Folder({
                        user: this.userId,
                        name: driveFolder.name,
                        parent,
                        googleDriveId: driveFolder.id,
                        syncedFromDrive: true,
                        lastSyncDate: new Date()
                    });

                    await folder.save();
                    syncedFolders.push(folder);
                }
            }

            // Aktualizacja daty ostatniej synchronizacji
            this.user.lastDriveSyncDate = new Date();
            await this.user.save();

            return {
                success: true,
                message: 'Foldery zsynchronizowane z Google Drive',
                syncedFolders: syncedFolders.length
            };
        } catch (error) {
            console.error('Błąd synchronizacji folderów z Google Drive:', error);
            throw new Error(`Błąd synchronizacji folderów: ${error.message}`);
        }
    }

    // Wysłanie folderów z aplikacji do Google Drive
    async syncFoldersTo() {
        try {
            // Pobierz wszystkie foldery użytkownika, które nie są jeszcze zsynchronizowane
            const folders = await Folder.find({
                user: this.userId,
                googleDriveId: { $exists: false }
            });

            const syncedFolders = [];

            for (const folder of folders) {
                // Parametry dla folderu na Google Drive
                const folderMetadata = {
                    name: folder.name,
                    mimeType: 'application/vnd.google-apps.folder'
                };

                // Jeśli folder ma rodzica, który jest zsynchronizowany z Google Drive
                if (folder.parent) {
                    const parentFolder = await Folder.findById(folder.parent);
                    if (parentFolder && parentFolder.googleDriveId) {
                        folderMetadata.parents = [parentFolder.googleDriveId];
                    }
                }

                // Utwórz folder na Google Drive
                const driveFolder = await this.drive.files.create({
                    resource: folderMetadata,
                    fields: 'id'
                });

                // Aktualizuj folder w bazie danych
                folder.googleDriveId = driveFolder.data.id;
                folder.syncedToDrive = true;
                folder.lastSyncDate = new Date();
                await folder.save();

                syncedFolders.push(folder);
            }

            // Aktualizacja daty ostatniej synchronizacji
            this.user.lastDriveSyncDate = new Date();
            await this.user.save();

            return {
                success: true,
                message: 'Foldery zsynchronizowane do Google Drive',
                syncedFolders: syncedFolders.length
            };
        } catch (error) {
            console.error('Błąd synchronizacji folderów do Google Drive:', error);
            throw new Error(`Błąd synchronizacji folderów: ${error.message}`);
        }
    }

    // Pobranie plików z Google Drive i zapisanie w aplikacji
    async syncFilesFrom() {
        try {
            // Pobierz wszystkie pliki z Google Drive (oprócz folderów)
            const response = await this.drive.files.list({
                q: "mimeType!='application/vnd.google-apps.folder'",
                fields: 'files(id, name, mimeType, parents, size, modifiedTime)',
                spaces: 'drive'
            });

            const driveFiles = response.data.files;
            const syncedFiles = [];

            for (const driveFile of driveFiles) {
                // Sprawdź czy plik już istnieje w bazie
                let file = await File.findOne({
                    user: this.userId,
                    googleDriveId: driveFile.id
                });

                // Jeśli plik już istnieje, sprawdź czy wymaga aktualizacji
                if (file) {
                    const driveModifiedTime = new Date(driveFile.modifiedTime);
                    if (file.lastSyncDate && driveModifiedTime <= file.lastSyncDate) {
                        // Plik na Google Drive nie został zmieniony od ostatniej synchronizacji
                        continue;
                    }
                }

                // Określenie kategorii pliku
                const category = getCategoryFromMimeType(driveFile.mimeType);

                // Określenie folderu nadrzędnego
                let folder = null;
                if (driveFile.parents && driveFile.parents.length > 0) {
                    const parentFolder = await Folder.findOne({
                        user: this.userId,
                        googleDriveId: driveFile.parents[0]
                    });
                    if (parentFolder) {
                        folder = parentFolder._id;
                    }
                }

                // Ścieżka do zapisania pliku
                const filePath = path.join(category, `${Date.now()}-${driveFile.name}`);
                const fullPath = path.resolve(process.env.UPLOADS_DIR, filePath);

                // Upewnij się, że folder docelowy istnieje
                await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

                // Pobierz plik z Google Drive
                const dest = fs.createWriteStream(fullPath);
                const response = await this.drive.files.get({
                    fileId: driveFile.id,
                    alt: 'media'
                }, { responseType: 'stream' });

                // Zapisz plik na dysku
                await new Promise((resolve, reject) => {
                    response.data
                        .on('end', resolve)
                        .on('error', reject)
                        .pipe(dest);
                });

                if (file) {
                    // Jeśli plik istnieje, zaktualizuj jego ścieżkę i datę synchronizacji
                    file.path = filePath.replace(/\\/g, '/');
                    file.lastSyncDate = new Date();
                    await file.save();
                } else {
                    // Utwórz nowy rekord pliku w bazie
                    file = new File({
                        user: this.userId,
                        path: filePath.replace(/\\/g, '/'),
                        originalName: driveFile.name,
                        mimetype: driveFile.mimeType,
                        category,
                        folder,
                        googleDriveId: driveFile.id,
                        syncedFromDrive: true,
                        lastSyncDate: new Date()
                    });
                    await file.save();
                }

                syncedFiles.push(file);
            }

            // Aktualizacja daty ostatniej synchronizacji
            this.user.lastDriveSyncDate = new Date();
            await this.user.save();

            return {
                success: true,
                message: 'Pliki zsynchronizowane z Google Drive',
                syncedFiles: syncedFiles.length
            };
        } catch (error) {
            console.error('Błąd synchronizacji plików z Google Drive:', error);
            throw new Error(`Błąd synchronizacji plików: ${error.message}`);
        }
    }

    // Wysłanie plików z aplikacji do Google Drive
    async syncFilesTo() {
        try {
            // Pobierz wszystkie pliki użytkownika, które nie są jeszcze zsynchronizowane
            const files = await File.find({
                user: this.userId,
                googleDriveId: { $exists: false }
            });

            const syncedFiles = [];

            for (const file of files) {
                // Ścieżka pliku lokalnego
                const localFilePath = path.resolve(process.env.UPLOADS_DIR, file.path);

                // Sprawdź czy plik istnieje
                try {
                    await fs.promises.access(localFilePath, fs.constants.F_OK);
                } catch (error) {
                    console.warn(`Plik ${localFilePath} nie istnieje, pomijam synchronizację`);
                    continue;
                }

                // Parametry dla pliku na Google Drive
                const fileMetadata = {
                    name: file.originalName
                };

                // Jeśli plik jest w folderze, który jest zsynchronizowany z Google Drive
                if (file.folder) {
                    const folder = await Folder.findById(file.folder);
                    if (folder && folder.googleDriveId) {
                        fileMetadata.parents = [folder.googleDriveId];
                    }
                }

                // Utwórz strumień odczytu pliku
                const fileStream = fs.createReadStream(localFilePath);

                // Wyślij plik na Google Drive
                const driveFile = await this.drive.files.create({
                    resource: fileMetadata,
                    media: {
                        mimeType: file.mimetype,
                        body: fileStream
                    },
                    fields: 'id'
                });

                // Aktualizuj plik w bazie danych
                file.googleDriveId = driveFile.data.id;
                file.syncedToDrive = true;
                file.lastSyncDate = new Date();
                await file.save();

                syncedFiles.push(file);
            }

            // Aktualizacja daty ostatniej synchronizacji
            this.user.lastDriveSyncDate = new Date();
            await this.user.save();

            return {
                success: true,
                message: 'Pliki zsynchronizowane do Google Drive',
                syncedFiles: syncedFiles.length
            };
        } catch (error) {
            console.error('Błąd synchronizacji plików do Google Drive:', error);
            throw new Error(`Błąd synchronizacji plików: ${error.message}`);
        }
    }

    // Pełna synchronizacja w obu kierunkach
    async fullSync() {
        try {
            const folderFromResult = await this.syncFoldersFrom();
            const folderToResult = await this.syncFoldersTo();
            const filesFromResult = await this.syncFilesFrom();
            const filesToResult = await this.syncFilesTo();

            return {
                success: true,
                foldersFromDrive: folderFromResult.syncedFolders,
                foldersToDrive: folderToResult.syncedFolders,
                filesFromDrive: filesFromResult.syncedFiles,
                filesToDrive: filesToResult.syncedFiles,
                lastSync: new Date()
            };
        } catch (error) {
            console.error('Błąd pełnej synchronizacji:', error);
            throw new Error(`Błąd pełnej synchronizacji: ${error.message}`);
        }
    }

    // Generowanie URL do autoryzacji Google Drive
    static getAuthUrl(userId) {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: process.env.GOOGLE_API_SCOPE.split(','),
            prompt: 'consent',  // Zawsze pytaj o zgodę, aby otrzymać refresh_token
            state: userId       // Przechowujemy userId w stanie, aby zidentyfikować użytkownika w callbacku
        });

        return { url };
    }

    // Obsługa callbacku po autoryzacji
    static async handleAuthCallback(userId, params) {
        const { code } = params;

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        try {
            // Wymiana kodu na tokeny
            const { tokens } = await oauth2Client.getToken(code);

            // Zapisanie tokenów w bazie dla użytkownika
            const user = await User.findById(userId);
            if (!user) {
                throw new Error('Użytkownik nie znaleziony');
            }

            user.googleDriveTokens = tokens;
            user.googleDriveEnabled = true;
            await user.save();

            return {
                success: true,
                message: 'Autoryzacja Google Drive zakończona pomyślnie'
            };
        } catch (error) {
            console.error('Błąd wymiany kodu na token:', error);
            throw new Error('Błąd autoryzacji Google Drive');
        }
    }
}

module.exports = GoogleDriveSync;