const GoogleDriveService = require('../services/GoogleDriveService');

class GoogleDriveController {
    
    // === AUTORYZACJA ===
    
    async getAuthUrl(req, res) {
        try {
            const authUrl = GoogleDriveService.getAuthUrl(req.user.userId);
            res.json({ authUrl });
        } catch (error) {
            console.error('Błąd generowania URL autoryzacji:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    async handleCallback(req, res) {
		try {
			const { code, state } = req.query;
			const { connectionName } = req.body;
			
			if (!code) {
				return res.redirect('/EditProfilePage.html?gdrive=error&msg=no_code');
			}
			
			if (!state) {
				return res.redirect('/EditProfilePage.html?gdrive=error&msg=no_state');
			}
			
			const userId = state;
			const driveClient = await GoogleDriveService.handleAuthCallback(code, userId, connectionName);
			
			// Przekieruj z powrotem na profil z informacją o sukcesie
			res.redirect('/EditProfilePage.html?gdrive=success');
			
			// Automatyczne tworzenie klienta synchronizacji
			const SyncService = require('../services/SyncService');
			await SyncService.ensureGoogleDriveClient(userId);
			
		} catch (error) {
			console.error('Błąd obsługi callback:', error);
			res.redirect('/EditProfilePage.html?gdrive=error&msg=' + encodeURIComponent(error.message));
		}
	}
    
    // === STATUS POŁĄCZENIA ===
    
    async getStatus(req, res) {
        try {
            const status = await GoogleDriveService.getConnectionStatus(req.user.userId);
            res.json(status);
        } catch (error) {
            console.error('Błąd pobierania statusu:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    async disconnect(req, res) {
        try {
            const result = await GoogleDriveService.disconnect(req.user.userId);
            res.json(result);
        } catch (error) {
            console.error('Błąd rozłączania:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    // === OPERACJE NA FOLDERACH ===
    
    async listFolders(req, res) {
        try {
            const { parentId = 'root' } = req.query;
            const folders = await GoogleDriveService.listDriveFolders(req.user.userId, parentId);
            res.json({ folders });
        } catch (error) {
            console.error('Błąd pobierania folderów:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    async createFolder(req, res) {
        try {
            const { name, parentId = 'root' } = req.body;
            
            if (!name) {
                return res.status(400).json({ error: 'Nazwa folderu jest wymagana' });
            }
            
            const folder = await GoogleDriveService.createDriveFolder(req.user.userId, name, parentId);
            res.status(201).json({ folder });
        } catch (error) {
            console.error('Błąd tworzenia folderu:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    // === SYNCHRONIZACJA ===
    
    async syncFolderToDrive(req, res) {
        try {
            const { localFolderId, driveFolderId } = req.body;
            
            if (!localFolderId || !driveFolderId) {
                return res.status(400).json({ 
                    error: 'localFolderId i driveFolderId są wymagane' 
                });
            }
            
            const result = await GoogleDriveService.syncFolderToDrive(
                req.user.userId, 
                localFolderId, 
                driveFolderId
            );
            
            res.json(result);
        } catch (error) {
            console.error('Błąd synchronizacji do Drive:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    async syncFolderFromDrive(req, res) {
        try {
            const { localFolderId, driveFolderId } = req.body;
            
            if (!localFolderId || !driveFolderId) {
                return res.status(400).json({ 
                    error: 'localFolderId i driveFolderId są wymagane' 
                });
            }
            
            const result = await GoogleDriveService.syncFromDrive(
                req.user.userId, 
                localFolderId, 
                driveFolderId
            );
            
            res.json(result);
        } catch (error) {
            console.error('Błąd synchronizacji z Drive:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    async fullSync(req, res) {
        try {
            const { localFolderId, driveFolderId, direction = 'bidirectional' } = req.body;
            
            if (!localFolderId || !driveFolderId) {
                return res.status(400).json({ 
                    error: 'localFolderId i driveFolderId są wymagane' 
                });
            }
            
            const results = {};
            
            if (direction === 'bidirectional' || direction === 'to-drive') {
                results.toDrive = await GoogleDriveService.syncFolderToDrive(
                    req.user.userId, 
                    localFolderId, 
                    driveFolderId
                );
            }
            
            if (direction === 'bidirectional' || direction === 'from-drive') {
                results.fromDrive = await GoogleDriveService.syncFromDrive(
                    req.user.userId, 
                    localFolderId, 
                    driveFolderId
                );
            }
            
            res.json({
                success: true,
                direction,
                results
            });
        } catch (error) {
            console.error('Błąd pełnej synchronizacji:', error);
            res.status(500).json({ error: error.message });
        }
    }
	
	async triggerManualSync(req, res) {
		try {
			const GoogleDriveClient = require('../models/GoogleDriveClient');
			const Folder = require('../models/Folder');
			
			// Sprawdź połączenie z Google Drive
			const driveClient = await GoogleDriveClient.findOne({ user: req.user.userId });
			
			if (!driveClient || !driveClient.status.isConnected) {
				return res.status(400).json({ error: 'Google Drive nie jest połączony' });
			}

			// DEBUG: Sprawdź userId
			console.log('Szukam folderów dla userId:', req.user.userId);
			
			// Znajdź foldery użytkownika - POPRAWIONE ZAPYTANIE
			const userFolders = await Folder.find({ 
				user: req.user.userId, 
				isDeleted: { $ne: true } // Sprawdź czy isDeleted nie jest true
			});
			
			console.log('Znalezione foldery:', userFolders.length); // DEBUG
			
			if (!userFolders || userFolders.length === 0) {
				// Dodatkowe debugowanie
				const allFolders = await Folder.find({ user: req.user.userId });
				console.log('Wszystkie foldery użytkownika (włącznie z usuniętymi):', allFolders.length);
				
				return res.status(400).json({ 
					error: 'Brak folderów do synchronizacji',
					debug: {
						userId: req.user.userId,
						totalFolders: allFolders.length,
						activeFolders: userFolders.length
					}
				});
			}

			// Użyj pierwszego dostępnego folderu
			const targetFolder = userFolders[0];
			console.log('Używam folderu:', targetFolder.name, 'ID:', targetFolder._id);

			// Sprawdź czy istnieją ustawienia synchronizacji dla tego folderu
			let driveFolderId = 'root'; // domyślnie root
			
			// Sprawdź czy folder ma już mapowanie do Google Drive
			const SyncFolder = require('../models/SyncFolder');
			const syncFolder = await SyncFolder.findOne({
				user: req.user.userId,
				folder: targetFolder._id
			});
			
			if (syncFolder && syncFolder.clients) {
				const googleDriveClient = syncFolder.clients.find(
					client => client.clientId === 'google-drive'
				);
				if (googleDriveClient && googleDriveClient.clientFolderId) {
					driveFolderId = googleDriveClient.clientFolderId;
				}
			}

			console.log('Synchronizuję z folderem Google Drive:', driveFolderId);

			// Wykonaj ręczną synchronizację (wymuszenie)
			const GoogleDriveService = require('../services/GoogleDriveService');
			const result = await GoogleDriveService.manualSyncFolder(
				req.user.userId, 
				targetFolder._id, 
				driveFolderId
			);

			// Sprawdź czy synchronizacja została pominięta
			if (result.skipped) {
				let message = 'Synchronizacja została pominięta: ';
				switch (result.reason) {
					case 'not_connected':
						message += 'Google Drive nie jest połączony';
						break;
					case 'auto_sync_disabled':
						message += 'Automatyczna synchronizacja jest wyłączona';
						break;
					case 'sync_in_progress':
						message += 'Synchronizacja już trwa';
						break;
					default:
						message += result.reason || 'Nieznany powód';
				}
				
				return res.json({
					success: false,
					skipped: true,
					message: message,
					reason: result.reason
				});
			}

			res.json({
				success: true,
				message: 'Synchronizacja zakończona',
				folder: {
					name: targetFolder.name,
					id: targetFolder._id
				},
				driveFolderId: driveFolderId,
				result: result
			});

		} catch (error) {
			console.error('Błąd ręcznej synchronizacji:', error);
			res.status(500).json({ 
				error: error.message,
				stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
			});
		}
	}
    
    // === ZARZĄDZANIE USTAWIENIAMI ===
    
    async updateSettings(req, res) {
        try {
            const { syncSettings } = req.body;
            
            const GoogleDriveClient = require('../models/GoogleDriveClient');
            const driveClient = await GoogleDriveClient.findOne({ user: req.user.userId });
            
            if (!driveClient) {
                return res.status(404).json({ error: 'Połączenie Google Drive nie znalezione' });
            }
            
            if (syncSettings) {
                driveClient.syncSettings = Object.assign({}, driveClient.syncSettings, syncSettings);
                await driveClient.save();
            }
            
            res.json({
                success: true,
                settings: driveClient.syncSettings
            });
        } catch (error) {
            console.error('Błąd aktualizacji ustawień:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    async getSettings(req, res) {
        try {
            const GoogleDriveClient = require('../models/GoogleDriveClient');
            const driveClient = await GoogleDriveClient.findOne({ user: req.user.userId });
            
            if (!driveClient) {
                return res.status(404).json({ error: 'Połączenie Google Drive nie znalezione' });
            }
            
            res.json({
                settings: driveClient.syncSettings,
                status: driveClient.status,
                stats: driveClient.stats
            });
        } catch (error) {
            console.error('Błąd pobierania ustawień:', error);
            res.status(500).json({ error: error.message });
        }
    }
	
	async setupGoogleDriveSync(req, res) {
		try {
			const { 
				folderId, 
				driveFolderId,
				syncDirection = 'bidirectional',
				isActive = true,
				clientFolderName = 'Google Drive',
				filters = null
			} = req.body;
			
			console.log('Otrzymane dane:', req.body);
			
			if (!folderId) {
				return res.status(400).json({ error: 'folderId jest wymagane' });
			}
			
			if (!driveFolderId) {
				return res.status(400).json({ error: 'driveFolderId jest wymagane - nie można synchronizować bez określenia folderu docelowego' });
			}
			
			console.log('Konfigurowanie synchronizacji:', { 
				folderId, 
				driveFolderId, 
				syncDirection,
				clientFolderName 
			});
			
			// Sprawdź czy Google Drive jest połączony
			const status = await GoogleDriveService.getConnectionStatus(req.user.userId);
			if (!status.connected) {
				return res.status(400).json({ error: 'Google Drive nie jest połączony' });
			}
			
			// Aktualizuj ustawienia synchronizacji
			const GoogleDriveClient = require('../models/GoogleDriveClient');
			const driveClient = await GoogleDriveClient.findOne({ user: req.user.userId });
			
			if (!driveClient) {
				return res.status(404).json({ error: 'Klient Google Drive nie znaleziony' });
			}
			
			// Ustaw ustawienia synchronizacji
			driveClient.syncSettings = {
				...driveClient.syncSettings,
				autoSync: isActive,
				syncDirection: syncDirection,
				filters: filters || {}
			};
			
			await driveClient.save();
			
			// POPRAWKA: Właściwa struktura klienta z wszystkimi wymaganymi polami
			const clientConfig = {
				clientId: 'google-drive',
				clientFolderId: driveFolderId,
				clientFolderName: clientFolderName,
				syncDirection: syncDirection,
				isActive: isActive,
				filters: filters || {},
				lastSyncDate: null
			};
			
			console.log('Konfiguracja klienta:', clientConfig); // DEBUG
			
			// Utwórz konfigurację synchronizacji
			const SyncService = require('../services/SyncService');
			const syncFolder = await SyncService.createSyncFolder(req.user.userId, folderId, [clientConfig]);
			
			console.log('Synchronizacja skonfigurowana z folderem:', driveFolderId);
			console.log('Utworzony syncFolder:', syncFolder);
			
			res.json({
				success: true,
				syncFolder,
				settings: driveClient.syncSettings,
				driveFolderId: driveFolderId,
				message: `Synchronizacja skonfigurowana z folderem Google Drive: ${driveFolderId}`
			});
			
		} catch (error) {
			console.error('Błąd konfiguracji synchronizacji Google Drive:', error);
			res.status(500).json({ error: error.message });
		}
	}
	
	async ensureGoogleDriveClient(req, res) {
		try {
			const userId = req.user.id;
			const SyncService = require('../services/SyncService');
			
			const client = await SyncService.ensureGoogleDriveClient(userId);
			
			if (!client) {
				return res.status(400).json({ 
					error: 'Google Drive nie jest połączony' 
				});
			}
			
			res.json({ 
				success: true, 
				message: 'Klient Google Drive został utworzony/zaktualizowany',
				client: {
					clientId: client.clientId,
					name: client.name,
					type: client.type,
					isActive: client.isActive
				}
			});
			
		} catch (error) {
			console.error('Błąd tworzenia klienta Google Drive:', error);
			res.status(500).json({ 
				error: 'Błąd tworzenia klienta Google Drive: ' + error.message 
			});
		}
	}			
}

module.exports = new GoogleDriveController();