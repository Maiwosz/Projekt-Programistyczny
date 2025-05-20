const { google } = require('googleapis');
const User = require('../models/User');
const Folder = require('../models/Folder');
const File = require('../models/File');
const fs = require('fs');
const path = require('path');
const stream = require('stream');

// Konfiguracja klienta OAuth2
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Inicjalizacja Google Drive API
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Funkcja pomocnicza do pobierania tokenu użytkownika
async function getUserTokens(userId) {
    const user = await User.findById(userId);
    if (!user || !user.googleDriveTokens) {
        throw new Error('Użytkownik nie ma uprawnień do Google Drive');
    }
    
    // Ustawienie tokenów dla klienta OAuth2
    oauth2Client.setCredentials(user.googleDriveTokens);
    
    // Sprawdzenie, czy token wymaga odświeżenia
    if (user.googleDriveTokens.expiry_date < Date.now()) {
        try {
            const { tokens } = await oauth2Client.refreshToken(user.googleDriveTokens.refresh_token);
            user.googleDriveTokens = { 
                ...user.googleDriveTokens, 
                ...tokens 
            };
            await user.save();
        } catch (error) {
            console.error('Błąd odświeżania tokena:', error);
            throw new Error('Błąd autoryzacji Google Drive');
        }
    }
    
    return user.googleDriveTokens;
}

// Generowanie URL do autoryzacji Google Drive
exports.getAuthUrl = (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: process.env.GOOGLE_API_SCOPE.split(','),
        prompt: 'consent'  // Zawsze pytaj o zgodę, aby otrzymać refresh_token
    });
    
    res.json({ url });
};

// Obsługa callbacku po autoryzacji Google Drive
exports.handleCallback = async (req, res) => {
    const { code } = req.query;
    
    try {
        // Wymiana kodu na tokeny
        const { tokens } = await oauth2Client.getToken(code);
        
        // Zapisanie tokenów w bazie dla użytkownika
        const user = await User.findById(req.user.userId);
        user.googleDriveTokens = tokens;
        user.googleDriveEnabled = true;
        await user.save();
        
        // Przekierowanie na stronę z folderami
        res.redirect('/drive-sync.html');
    } catch (error) {
        console.error('Błąd wymiany kodu na token:', error);
        res.status(500).send('Błąd autoryzacji Google Drive');
    }
};

// Synchronizacja folderów z Google Drive do aplikacji
exports.syncFoldersFromDrive = async (req, res) => {
    try {
        // Pobierz tokeny użytkownika
        await getUserTokens(req.user.userId);
        
        // Pobierz wszystkie foldery z Google Drive
        const response = await drive.files.list({
            q: "mimeType='application/vnd.google-apps.folder'",
            fields: 'files(id, name, parents)',
            spaces: 'drive'
        });
        
        const driveFolders = response.data.files;
        
        // Mapowanie folderów Google Drive na foldery aplikacji
        for (const driveFolder of driveFolders) {
            // Sprawdź czy folder już istnieje w bazie
            let folder = await Folder.findOne({
                user: req.user.userId,
                googleDriveId: driveFolder.id
            });
            
            if (!folder) {
                // Określenie rodzica folderu
                let parent = null;
                if (driveFolder.parents && driveFolder.parents.length > 0) {
                    const parentFolder = await Folder.findOne({
                        user: req.user.userId,
                        googleDriveId: driveFolder.parents[0]
                    });
                    if (parentFolder) {
                        parent = parentFolder._id;
                    }
                }
                
                // Utwórz nowy folder
                folder = new Folder({
                    user: req.user.userId,
                    name: driveFolder.name,
                    parent,
                    googleDriveId: driveFolder.id,
                    syncedFromDrive: true
                });
                
                await folder.save();
            }
        }
        
        res.json({ success: true, message: 'Foldery zsynchronizowane z Google Drive' });
    } catch (error) {
        console.error('Błąd synchronizacji z Google Drive:', error);
        res.status(500).json({ 
            error: 'Błąd synchronizacji z Google Drive',
            details: error.message
        });
    }
};

// Synchronizacja folderów z aplikacji do Google Drive
exports.syncFoldersToDrive = async (req, res) => {
    try {
        // Pobierz tokeny użytkownika
        await getUserTokens(req.user.userId);
        
        // Pobierz wszystkie foldery użytkownika, które nie są jeszcze zsynchronizowane
        const folders = await Folder.find({
            user: req.user.userId,
            googleDriveId: { $exists: false }
        });
        
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
            const driveFolder = await drive.files.create({
                resource: folderMetadata,
                fields: 'id'
            });
            
            // Aktualizuj folder w bazie danych
            folder.googleDriveId = driveFolder.data.id;
            folder.syncedToDrive = true;
            await folder.save();
        }
        
        res.json({ success: true, message: 'Foldery zsynchronizowane do Google Drive' });
    } catch (error) {
        console.error('Błąd synchronizacji do Google Drive:', error);
        res.status(500).json({ 
            error: 'Błąd synchronizacji do Google Drive',
            details: error.message
        });
    }
};

// Synchronizacja plików z Google Drive do aplikacji
exports.syncFilesFromDrive = async (req, res) => {
    try {
        // Pobierz tokeny użytkownika
        await getUserTokens(req.user.userId);
        
        // Pobierz wszystkie pliki z Google Drive (oprócz folderów)
        const response = await drive.files.list({
            q: "mimeType!='application/vnd.google-apps.folder'",
            fields: 'files(id, name, mimeType, parents, size)',
            spaces: 'drive'
        });
        
        const driveFiles = response.data.files;
        
        for (const driveFile of driveFiles) {
            // Sprawdź czy plik już istnieje w bazie
            let file = await File.findOne({
                user: req.user.userId,
                googleDriveId: driveFile.id
            });
            
            if (!file) {
                // Określenie kategorii pliku
                const category = getCategoryFromMimeType(driveFile.mimeType);
                
                // Określenie folderu nadrzędnego
                let folder = null;
                if (driveFile.parents && driveFile.parents.length > 0) {
                    const parentFolder = await Folder.findOne({
                        user: req.user.userId,
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
                const response = await drive.files.get({
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
                
                // Utwórz nowy rekord pliku w bazie
                file = new File({
                    user: req.user.userId,
                    path: filePath.replace(/\\/g, '/'),
                    originalName: driveFile.name,
                    mimetype: driveFile.mimeType,
                    category,
                    folder,
                    googleDriveId: driveFile.id,
                    syncedFromDrive: true
                });
                
                await file.save();
            }
        }
        
        res.json({ success: true, message: 'Pliki zsynchronizowane z Google Drive' });
    } catch (error) {
        console.error('Błąd synchronizacji plików z Google Drive:', error);
        res.status(500).json({ 
            error: 'Błąd synchronizacji plików',
            details: error.message
        });
    }
};

// Synchronizacja plików z aplikacji do Google Drive
exports.syncFilesToDrive = async (req, res) => {
    try {
        // Pobierz tokeny użytkownika
        await getUserTokens(req.user.userId);
        
        // Pobierz wszystkie pliki użytkownika, które nie są jeszcze zsynchronizowane
        const files = await File.find({
            user: req.user.userId,
            googleDriveId: { $exists: false }
        });
        
        for (const file of files) {
            // Ścieżka pliku lokalnego
            const localFilePath = path.resolve(process.env.UPLOADS_DIR, file.path);
            
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
            const driveFile = await drive.files.create({
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
            await file.save();
        }
        
        res.json({ success: true, message: 'Pliki zsynchronizowane do Google Drive' });
    } catch (error) {
        console.error('Błąd synchronizacji plików do Google Drive:', error);
        res.status(500).json({ 
            error: 'Błąd synchronizacji plików',
            details: error.message
        });
    }
};

// Funkcja pomocnicza do określania kategorii pliku na podstawie MIME Type
function getCategoryFromMimeType(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype === 'application/pdf' || mimetype.startsWith('text/')) return 'document';
    return 'other';
}

// Sprawdzenie czy konto jest połączone z Google Drive
exports.checkDriveConnection = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        
        res.json({
            connected: !!user.googleDriveEnabled && !!user.googleDriveTokens,
            lastSync: user.lastDriveSyncDate || null
        });
    } catch (error) {
        res.status(500).json({ error: 'Błąd sprawdzania połączenia z Google Drive' });
    }
};

// Odłączenie konta Google Drive
exports.disconnectDrive = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        user.googleDriveTokens = undefined;
        user.googleDriveEnabled = false;
        await user.save();
        
        res.json({ success: true, message: 'Konto Google Drive odłączone' });
    } catch (error) {
        console.error('Błąd odłączania konta Google Drive:', error);
        res.status(500).json({ error: 'Błąd odłączania konta' });
    }
};