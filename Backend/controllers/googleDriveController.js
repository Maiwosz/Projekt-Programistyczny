const GoogleDriveConnectionService = require('../services/GoogleDriveConnectionService');
const GoogleDriveSyncService = require('../services/GoogleDriveSyncService');
const GoogleDriveSchedulerService = require('../services/GoogleDriveSchedulerService');

class GoogleDriveController {
    
    constructor() {
        // Inicjalizuj scheduler z referencją do sync service
        this.schedulerService = new GoogleDriveSchedulerService(GoogleDriveSyncService);
    }
    
    // === AUTORYZACJA ===
    
    async getAuthUrl(req, res) {
        try {
            const userId = req.user.userId;
            const authUrl = GoogleDriveConnectionService.getAuthUrl(userId);
            
            res.json({
                success: true,
                authUrl: authUrl
            });
        } catch (error) {
            console.error('Błąd generowania URL autoryzacji:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd generowania URL autoryzacji',
                error: error.message
            });
        }
    }
    
    async handleCallback(req, res) {
        try {
            // Sprawdź zarówno query params jak i body
            const code = req.query.code || req.body.code;
            const userId = req.query.state || req.body.state;
            const { connectionName } = req.body;
            
            if (!code || !userId) {
                return res.redirect('/EditProfilePage.html?gdrive=error&msg=Brak wymaganych parametrów');
            }
            
            const driveClient = await GoogleDriveConnectionService.handleAuthCallback(
                code, 
                userId, 
                connectionName || 'Google Drive'
            );
            
            res.redirect('/EditProfilePage.html?gdrive=success');
            
        } catch (error) {
            console.error('Błąd obsługi callback autoryzacji:', error);
            res.redirect(`/EditProfilePage.html?gdrive=error&msg=${encodeURIComponent(error.message)}`);
        }
    }
    
    // === STATUS I ZARZĄDZANIE POŁĄCZENIEM ===
    
    async getConnectionStatus(req, res) {
        try {
            const userId = req.user.userId;
            const status = await GoogleDriveConnectionService.getConnectionStatus(userId);
            
            res.json({
                success: true,
                status: status
            });
        } catch (error) {
            console.error('Błąd pobierania statusu połączenia:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd pobierania statusu połączenia',
                error: error.message
            });
        }
    }
    
    async disconnect(req, res) {
        try {
            const userId = req.user.userId;
            const result = await GoogleDriveConnectionService.disconnect(userId);
            
            res.json({
                success: true,
                message: 'Rozłączono z Google Drive'
            });
        } catch (error) {
            console.error('Błąd rozłączania z Google Drive:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd rozłączania z Google Drive',
                error: error.message
            });
        }
    }
        
    // === USTAWIENIA SYNCHRONIZACJI ===
    
    async getSyncSettings(req, res) {
        try {
            const userId = req.user.userId;
            const status = await GoogleDriveConnectionService.getConnectionStatus(userId);
            
            if (!status.connected) {
                return res.status(404).json({
                    success: false,
                    message: 'Brak połączenia z Google Drive'
                });
            }
            
            res.json({
                success: true,
                syncSettings: status.syncSettings
            });
        } catch (error) {
            console.error('Błąd pobierania ustawień synchronizacji:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd pobierania ustawień synchronizacji',
                error: error.message
            });
        }
    }
    
    async updateSyncSettings(req, res) {
        try {
            const userId = req.user.userId;
            const settings = req.body;
            
            console.log('[CONTROLLER] Aktualizacja ustawień synchronizacji:', { userId, settings });
            
            // Walidacja podstawowych ustawień
            if (settings.syncInterval && settings.syncInterval < 60000) {
                return res.status(400).json({
                    success: false,
                    message: 'Interwał synchronizacji nie może być krótszy niż 1 minuta'
                });
            }
            
            // Sprawdź czy schedulerService istnieje
            if (!this.schedulerService) {
                console.error('[CONTROLLER] schedulerService nie został zainicjalizowany');
                // Fallback - bezpośrednia aktualizacja ustawień
                const updatedSettings = await GoogleDriveConnectionService.updateSyncSettings(userId, settings);
                
                return res.json({
                    success: true,
                    message: 'Ustawienia synchronizacji zaktualizowane',
                    syncSettings: updatedSettings
                });
            }
            
            // Użyj schedulerService do aktualizacji ustawień (restart automatycznej synchronizacji)
            const updatedSettings = await this.schedulerService.updateSyncSettings(userId, settings);
            
            res.json({
                success: true,
                message: 'Ustawienia synchronizacji zaktualizowane',
                syncSettings: updatedSettings
            });
        } catch (error) {
            console.error('Błąd aktualizacji ustawień synchronizacji:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd aktualizacji ustawień synchronizacji',
                error: error.message
            });
        }
    }
    
    // === SYNCHRONIZACJA ===
    
    async triggerManualSync(req, res) {
        console.log('[CONTROLLER] Żądanie manualnej synchronizacji');
        console.log('[CONTROLLER] User:', req.user);
        console.log('[CONTROLLER] Body:', req.body);
        
        try {
            const userId = req.user.userId;
            const { folderId } = req.body;
            
            console.log(`[CONTROLLER] Wywołanie manualnej synchronizacji - userId: ${userId}, folderId: ${folderId}`);
            
            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Brak identyfikatora użytkownika'
                });
            }
            
            const result = await GoogleDriveSyncService.syncFolder(userId, folderId);
            
            console.log('[CONTROLLER] Synchronizacja zakończona pomyślnie:', result);
            
            res.json({
                success: true,
                message: 'Synchronizacja zakończona pomyślnie',
                data: result
            });
            
        } catch (error) {
            console.error('[CONTROLLER] Błąd ręcznej synchronizacji:', error);
            
            res.status(500).json({
                success: false,
                message: 'Błąd ręcznej synchronizacji',
                error: error.message,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
    
    async startAutoSync(req, res) {
        try {
            const userId = req.user.userId;
            
            if (!this.schedulerService) {
                return res.status(500).json({
                    success: false,
                    message: 'Usługa schedulera nie jest dostępna'
                });
            }
            
            const result = await this.schedulerService.startAutoSync(userId);
            
            res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            console.error('Błąd włączania automatycznej synchronizacji:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd włączania automatycznej synchronizacji',
                error: error.message
            });
        }
    }
    
    async stopAutoSync(req, res) {
        try {
            const userId = req.user.userId;
            
            if (!this.schedulerService) {
                return res.status(500).json({
                    success: false,
                    message: 'Usługa schedulera nie jest dostępna'
                });
            }
            
            const result = await this.schedulerService.stopAutoSync(userId);
            
            res.json({
                success: true,
                message: result.message
            });
        } catch (error) {
            console.error('Błąd wyłączania automatycznej synchronizacji:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd wyłączania automatycznej synchronizacji',
                error: error.message
            });
        }
    }
    
    // === OPERACJE NA FOLDERACH GOOGLE DRIVE ===
    
    async listDriveFolders(req, res) {
        try {
            const userId = req.user.userId;
            const { parentId } = req.query;
            
            const folders = await GoogleDriveSyncService.listDriveFolders(userId, parentId);
            
            res.json({
                success: true,
                folders: folders
            });
        } catch (error) {
            console.error('Błąd pobierania folderów Google Drive:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd pobierania folderów Google Drive',
                error: error.message
            });
        }
    }
    
    async createDriveFolder(req, res) {
        try {
            const userId = req.user.userId;
            const { name, parentId } = req.body;
            
            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'Nazwa folderu jest wymagana'
                });
            }
            
            const folder = await GoogleDriveSyncService.createDriveFolder(userId, name, parentId);
            
            res.json({
                success: true,
                message: 'Folder utworzony pomyślnie',
                folder: folder
            });
        } catch (error) {
            console.error('Błąd tworzenia folderu Google Drive:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd tworzenia folderu Google Drive',
                error: error.message
            });
        }
    }
    
    // === ZARZĄDZANIE SYNCHRONIZACJĄ FOLDERÓW ===

    async createSyncFolder(req, res) {
        try {
            const userId = req.user.userId;
            const { folderId, driveFolderId, driveFolderName } = req.body;
            
            // Walidacja wymaganych parametrów
            if (!folderId) {
                return res.status(400).json({
                    success: false,
                    message: 'ID folderu serwera jest wymagany'
                });
            }
            
            if (!driveFolderId) {
                return res.status(400).json({
                    success: false,
                    message: 'ID folderu Google Drive jest wymagany'
                });
            }
            
            const syncFolder = await GoogleDriveSyncService.createSyncFolder(
                userId, 
                folderId, 
                driveFolderId,
                driveFolderName
            );
            
            res.json({
                success: true,
                message: 'Synchronizacja folderu została utworzona pomyślnie',
                syncFolder: syncFolder
            });
        } catch (error) {
            console.error('Błąd tworzenia synchronizacji folderu:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd tworzenia synchronizacji folderu',
                error: error.message
            });
        }
    }
    
    // === INFORMACJE DIAGNOSTYCZNE ===
    
    async getDiagnostics(req, res) {
        try {
            const userId = req.user.userId;
            const connectionStatus = await GoogleDriveConnectionService.getConnectionStatus(userId);
            const syncStatus = this.schedulerService ? await this.schedulerService.getSyncStatus(userId) : null;
            
            const diagnostics = {
                connection: connectionStatus,
                sync: syncStatus,
                scheduler: this.schedulerService ? {
                    activeSyncCount: this.schedulerService.getActiveSyncCount(),
                    activeSchedules: this.schedulerService.getActiveSchedules()
                } : null,
                timestamp: new Date().toISOString(),
                userId: userId
            };
            
            res.json({
                success: true,
                diagnostics: diagnostics
            });
        } catch (error) {
            console.error('Błąd pobierania diagnostyki:', error);
            res.status(500).json({
                success: false,
                message: 'Błąd pobierania diagnostyki',
                error: error.message
            });
        }
    }
}

// ZMIANA: Eksportuj KLASĘ, nie instancję
module.exports = GoogleDriveController;