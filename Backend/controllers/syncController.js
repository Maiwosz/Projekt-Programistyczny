const SyncService = require('../services/SyncService');

class SyncController {
    
    // === ZARZĄDZANIE KLIENTAMI ===
    
    async registerClient(req, res) {
        try {
            const userId = req.user.userId;
            const { type, name, metadata } = req.body;
            
            if (!type || !name) {
                return res.status(400).json({
                    error: 'Wymagane pola: type, name'
                });
            }
            
            const client = await SyncService.registerClient(userId, {
                type,
                name,
                metadata: metadata || {}
            });
            
            res.status(201).json({
                success: true,
                client: {
                    clientId: client.clientId,
                    type: client.type,
                    name: client.name,
                    metadata: client.metadata,
                    isActive: client.isActive,
                    lastSeen: client.lastSeen
                }
            });
            
        } catch (error) {
            console.error('Błąd rejestracji klienta:', error);
            res.status(500).json({
                error: 'Błąd podczas rejestracji klienta'
            });
        }
    }
    
    async getClient(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId } = req.params;
            
            const client = await SyncService.getClient(userId, clientId);
            
            if (!client) {
                return res.status(404).json({
                    error: 'Klient nie znaleziony'
                });
            }
            
            res.json({
                success: true,
                client: {
                    clientId: client.clientId,
                    type: client.type,
                    name: client.name,
                    metadata: client.metadata,
                    isActive: client.isActive,
                    lastSeen: client.lastSeen
                }
            });
            
        } catch (error) {
            console.error('Błąd pobierania klienta:', error);
            res.status(500).json({
                error: 'Błąd podczas pobierania danych klienta'
            });
        }
    }
    
    async updateClientActivity(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId } = req.params;
            
            await SyncService.updateClientActivity(userId, clientId);
            
            res.json({
                success: true,
                message: 'Aktywność klienta zaktualizowana'
            });
            
        } catch (error) {
            console.error('Błąd aktualizacji aktywności:', error);
            res.status(500).json({
                error: 'Błąd podczas aktualizacji aktywności klienta'
            });
        }
    }
    
    // === KONFIGURACJA SYNCHRONIZACJI FOLDERÓW ===
    
    async addSyncFolder(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, folderPath, serverFolderId } = req.body;
            
            if (!clientId || !folderPath || !serverFolderId) {
                return res.status(400).json({
                    error: 'Wymagane pola: clientId, folderPath, serverFolderId'
                });
            }
            
            const syncFolder = await SyncService.addSyncFolder(
                userId, 
                clientId, 
                folderPath, 
                serverFolderId
            );
            
            res.status(201).json({
                success: true,
                syncFolder: {
                    id: syncFolder._id,
                    folder: syncFolder.folder,
                    clients: syncFolder.clients
                }
            });
            
        } catch (error) {
            console.error('Błąd dodawania folderu sync:', error);
            
            if (error.message.includes('nie znaleziony') || 
                error.message.includes('już synchronizuje')) {
                return res.status(400).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas dodawania folderu do synchronizacji'
            });
        }
    }
    
    async removeSyncFolder(req, res) {
        try {
            const userId = req.user.userId;
            const { folderId } = req.params;
            
            await SyncService.removeSyncFolder(userId, folderId);
            
            res.json({
                success: true,
                message: 'Folder usunięty z synchronizacji'
            });
            
        } catch (error) {
            console.error('Błąd usuwania folderu sync:', error);
            res.status(500).json({
                error: 'Błąd podczas usuwania folderu z synchronizacji'
            });
        }
    }
    
    // === SYNCHRONIZACJA - GŁÓWNY INTERFEJS ===
    
    async getFolderSyncState(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, folderId } = req.params;
            
            const syncState = await SyncService.getFolderSyncState(
                userId, 
                clientId, 
                folderId
            );
            
            res.json({
                success: true,
                ...syncState
            });
            
        } catch (error) {
            console.error('Błąd pobierania stanu sync:', error);
            
            if (error.message.includes('nie znaleziony') ||
                error.message.includes('nie jest synchronizowany')) {
                return res.status(400).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas pobierania stanu synchronizacji'
            });
        }
    }
    
    async confirmSyncCompleted(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, folderId } = req.params;
            const { completedOperations } = req.body;
            
            if (!Array.isArray(completedOperations)) {
                return res.status(400).json({
                    error: 'completedOperations musi być tablicą'
                });
            }
            
            const result = await SyncService.confirmSyncCompleted(
                userId,
                clientId,
                folderId,
                completedOperations
            );
            
            res.json(result);
            
        } catch (error) {
            console.error('Błąd potwierdzenia sync:', error);
            
            if (error.message.includes('nie znaleziony')) {
                return res.status(400).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas potwierdzania synchronizacji'
            });
        }
    }
    
    // === OPERACJE NA PLIKACH PODCZAS SYNCHRONIZACJI ===
    
    async downloadFileForSync(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, fileId } = req.params;
            
            const result = await SyncService.downloadFileForSync(
                userId, 
                clientId, 
                fileId
            );
            
            res.json({
                success: true,
                file: result.file,
                content: result.content,
                contentType: result.contentType
            });
            
        } catch (error) {
            console.error('Błąd pobierania pliku do sync:', error);
            
            if (error.message.includes('nie znaleziony')) {
                return res.status(404).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas pobierania pliku'
            });
        }
    }
    
    async confirmFileDownloaded(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, fileId } = req.params;
            const clientFileInfo = req.body;
            
            const requiredFields = ['clientFileId', 'clientFileName', 'clientPath', 'clientLastModified'];
            const missingFields = requiredFields.filter(field => !clientFileInfo[field]);
            
            if (missingFields.length > 0) {
                return res.status(400).json({
                    error: `Brakujące pola: ${missingFields.join(', ')}`
                });
            }
            
            const result = await SyncService.confirmFileDownloaded(
                userId,
                clientId,
                fileId,
                clientFileInfo
            );
            
            res.json(result);
            
        } catch (error) {
            console.error('Błąd potwierdzenia pobrania:', error);
            
            if (error.message.includes('nie znaleziony')) {
                return res.status(404).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas potwierdzania pobrania pliku'
            });
        }
    }
    
    async confirmFileDeleted(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, fileId } = req.params;
            
            const result = await SyncService.confirmFileDeleted(
                userId,
                clientId,
                fileId
            );
            
            res.json(result);
            
        } catch (error) {
            console.error('Błąd potwierdzenia usunięcia:', error);
            
            if (error.message.includes('nie znaleziony')) {
                return res.status(404).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas potwierdzania usunięcia pliku'
            });
        }
    }
    
    // === OZNACZANIE PLIKÓW DO SYNCHRONIZACJI ===
    
    async markFileForSync(req, res) {
        try {
            const userId = req.user.userId;
            const { fileId } = req.params;
            const { operation = 'modified' } = req.body;
            
            await SyncService.markFileForSync(userId, fileId, operation);
            
            res.json({
                success: true,
                message: 'Plik oznaczony do synchronizacji'
            });
            
        } catch (error) {
            console.error('Błąd oznaczania pliku:', error);
            res.status(500).json({
                error: 'Błąd podczas oznaczania pliku do synchronizacji'
            });
        }
    }
    
    async markFolderForSync(req, res) {
        try {
            const userId = req.user.userId;
            const { folderId } = req.params;
            
            await SyncService.markFolderForSync(userId, folderId);
            
            res.json({
                success: true,
                message: 'Folder oznaczony do synchronizacji'
            });
            
        } catch (error) {
            console.error('Błąd oznaczania folderu:', error);
            res.status(500).json({
                error: 'Błąd podczas oznaczania folderu do synchronizacji'
            });
        }
    }
	
	// === ZARZĄDZANIE SYNCHRONIZACJAMI FOLDERÓW - INTERFEJS WEBOWY ===

	async getFolderSyncs(req, res) {
		try {
			const userId = req.user.userId;
			const { folderId } = req.params;
			
			const syncFolder = await SyncService.getSyncFolder(userId, folderId);
			
			if (!syncFolder) {
				return res.json({
					success: true,
					syncs: []
				});
			}
			
			const syncs = syncFolder.clients.map(client => ({
				id: client._id,
				clientName: client.clientFolderName || client.name,
				clientType: client.type || 'unknown',
				syncDirection: client.syncDirection,
				clientFolderPath: client.clientFolderPath,
				isActive: client.isActive,
				lastSyncDate: client.lastSyncDate
			}));
			
			res.json({
				success: true,
				syncs: syncs
			});
			
		} catch (error) {
			console.error('Błąd pobierania synchronizacji:', error);
			res.status(500).json({
				error: 'Błąd podczas pobierania synchronizacji folderu'
			});
		}
	}

	async getSyncDetails(req, res) {
		try {
			const userId = req.user.userId;
			const { folderId, syncId } = req.params;
			
			const syncFolder = await SyncService.getSyncFolder(userId, folderId);
			
			if (!syncFolder) {
				return res.status(404).json({
					error: 'Folder synchronizacji nie znaleziony'
				});
			}
			
			const syncClient = syncFolder.clients.find(c => c._id.toString() === syncId);
			
			if (!syncClient) {
				return res.status(404).json({
					error: 'Synchronizacja nie znaleziona'
				});
			}
			
			res.json({
				success: true,
				sync: {
					id: syncClient._id,
					clientName: syncClient.clientFolderName || syncClient.name,
					clientType: syncClient.type || 'unknown',
					syncDirection: syncClient.syncDirection,
					clientFolderPath: syncClient.clientFolderPath,
					isActive: syncClient.isActive,
					lastSyncDate: syncClient.lastSyncDate
				}
			});
			
		} catch (error) {
			console.error('Błąd pobierania szczegółów synchronizacji:', error);
			res.status(500).json({
				error: 'Błąd podczas pobierania szczegółów synchronizacji'
			});
		}
	}

	async updateSyncSettings(req, res) {
		try {
			const userId = req.user.userId;
			const { folderId, syncId } = req.params;
			const { syncDirection, clientFolderPath, isActive } = req.body;
			
			const result = await SyncService.updateSyncSettings(
				userId, 
				folderId, 
				syncId, 
				{ syncDirection, clientFolderPath, isActive }
			);
			
			if (!result) {
				return res.status(404).json({
					error: 'Synchronizacja nie znaleziona'
				});
			}
			
			res.json({
				success: true,
				message: 'Ustawienia synchronizacji zaktualizowane'
			});
			
		} catch (error) {
			console.error('Błąd aktualizacji ustawień synchronizacji:', error);
			res.status(500).json({
				error: 'Błąd podczas aktualizacji ustawień synchronizacji'
			});
		}
	}

	async deleteSyncFolder(req, res) {
		try {
			const userId = req.user.userId;
			const { folderId, syncId } = req.params;
			
			const result = await SyncService.deleteSyncClient(userId, folderId, syncId);
			
			if (!result) {
				return res.status(404).json({
					error: 'Synchronizacja nie znaleziona'
				});
			}
			
			res.json({
				success: true,
				message: 'Synchronizacja usunięta'
			});
			
		} catch (error) {
			console.error('Błąd usuwania synchronizacji:', error);
			res.status(500).json({
				error: 'Błąd podczas usuwania synchronizacji'
			});
		}
	}
}

module.exports = new SyncController();