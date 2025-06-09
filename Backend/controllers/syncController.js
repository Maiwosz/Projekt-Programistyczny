const SyncService = require('../services/SyncService');

/**
 * Kontroler synchronizacji plików między klientami a serwerem
 * 
 * Obsługuje pełny cykl synchronizacji:
 * 1. Rejestracja i zarządzanie klientami
 * 2. Konfiguracja folderów do synchronizacji
 * 3. Główny proces synchronizacji (pobieranie stanu + operacje na plikach)
 * 4. Potwierdzenie zakończenia synchronizacji
 */
class SyncController {
    
    // ===== ZARZĄDZANIE KLIENTAMI =====
    
    /**
     * Rejestruje nowego klienta synchronizacji w systemie
     * POST /api/sync/clients
     */
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
                    clientId: client._id.toString(),
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
    
    /**
     * Pobiera informacje o zarejestrowanym kliencie
     * GET /api/sync/clients/:clientId
     */
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
                    clientId: client._id.toString(),
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
    
    /**
     * Aktualizuje timestamp ostatniej aktywności klienta (heartbeat)
     * PUT /api/sync/clients/:clientId/activity
     */
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
    
    // ===== KONFIGURACJA SYNCHRONIZACJI FOLDERÓW =====
    
    /**
     * Dodaje folder serwera do synchronizacji z lokalnym folderem klienta
     * POST /api/sync/folders
     */
    async addFolderToSync(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, clientFolderPath, serverFolderId, clientFolderName } = req.body;
            
            if (!clientId || !clientFolderPath || !serverFolderId) {
                return res.status(400).json({
                    error: 'Wymagane pola: clientId, clientFolderPath, serverFolderId'
                });
            }
            
            const syncFolder = await SyncService.addFolderToSync(
                userId, 
                clientId, 
                clientFolderPath, 
                serverFolderId,
                clientFolderName
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
            console.error('Błąd dodawania folderu do synchronizacji:', error);
            
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
    
    /**
     * Usuwa folder z synchronizacji (całkowicie lub tylko dla określonego klienta)
     * DELETE /api/sync/folders/:folderId?clientId=xxx
     */
    async removeFolderFromSync(req, res) {
        try {
            const userId = req.user.userId;
            const { folderId } = req.params;
            const { clientId } = req.query;
            
            await SyncService.removeFolderFromSync(userId, folderId, clientId || null);
            
            res.json({
                success: true,
                message: clientId ? 
                    'Klient usunięty z synchronizacji folderu' : 
                    'Folder całkowicie usunięty z synchronizacji'
            });
            
        } catch (error) {
            console.error('Błąd usuwania folderu z synchronizacji:', error);
            res.status(500).json({
                error: 'Błąd podczas usuwania folderu z synchronizacji'
            });
        }
    }
    
    /**
     * Pobiera informacje o synchronizacji folderu (klienci, ustawienia)
     * GET /api/sync/folders/:folderId/info
     */
    async getSyncFolderInfo(req, res) {
        try {
            const userId = req.user.userId;
            const { folderId } = req.params;
            
            const syncInfo = await SyncService.getSyncFolderInfo(userId, folderId);
            
            if (!syncInfo) {
                return res.json({
                    success: true,
                    syncFolder: null,
                    message: 'Folder nie jest synchronizowany'
                });
            }
            
            res.json({
                success: true,
                syncFolder: syncInfo
            });
            
        } catch (error) {
            console.error('Błąd pobierania informacji o synchronizacji:', error);
            res.status(500).json({
                error: 'Błąd podczas pobierania informacji o synchronizacji'
            });
        }
    }
    
    // ===== GŁÓWNY PROCES SYNCHRONIZACJI =====
    
    /**
     * KROK 1: Pobiera dane synchronizacji - listę wszystkich operacji do wykonania
     * GET /api/sync/folders/:folderId/sync-data/:clientId
     */
    async getSyncData(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, folderId } = req.params;
            
            const syncData = await SyncService.getSyncData(
                userId, 
                clientId, 
                folderId
            );
            
            res.json({
                success: true,
                ...syncData
            });
            
        } catch (error) {
            console.error('Błąd pobierania danych synchronizacji:', error);
            
            if (error.message.includes('nie znaleziony') ||
                error.message.includes('nie jest synchronizowany')) {
                return res.status(400).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas pobierania danych synchronizacji'
            });
        }
    }
    
    /**
     * KROK 2A: Pobiera plik z serwera (do pobrania przez klienta)
     * GET /api/sync/files/:fileId/download/:clientId
     */
    async downloadFileFromServer(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, fileId } = req.params;
            
            const result = await SyncService.downloadFileFromServer(
                userId, 
                clientId, 
                fileId
            );
            
            res.json({
                success: true,
                file: result.file,
                content: result.content || '',
                contentType: result.contentType
            });
            
        } catch (error) {
            console.error('Błąd pobierania pliku z serwera:', error);
            
            if (error.message.includes('nie znaleziony')) {
                return res.status(404).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas pobierania pliku z serwera'
            });
        }
    }
    
    /**
     * KROK 2B: Wysyła nowy plik z klienta na serwer
     * POST /api/sync/folders/:folderId/files/:clientId
     */
    async uploadNewFileToServer(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, folderId } = req.params;
            const fileData = req.body;
            
            const requiredFields = ['name', 'hash', 'clientFileId'];
            const missingFields = requiredFields.filter(field => !fileData[field]);
            
            if (missingFields.length > 0) {
                return res.status(400).json({
                    error: `Wymagane pola: ${missingFields.join(', ')}`
                });
            }
            
            // Zabezpieczenie przed pustym contentem
            if (fileData.content === undefined || fileData.content === null) {
                fileData.content = '';
            }
            
            const result = await SyncService.uploadNewFileToServer(
                userId, 
                clientId, 
                folderId, 
                fileData
            );
            
            res.status(201).json({
                success: true,
                fileId: result.fileId,
                message: 'Nowy plik przesłany na serwer'
            });
            
        } catch (error) {
            console.error('Błąd uploadu nowego pliku:', error);
            
            if (error.message.includes('nie znaleziony')) {
                return res.status(404).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas przesyłania nowego pliku na serwer'
            });
        }
    }
    
    /**
     * KROK 2C: Aktualizuje istniejący plik na serwerze
     * PUT /api/sync/files/:fileId/update/:clientId
     */
    async updateExistingFileOnServer(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, fileId } = req.params;
            const fileData = req.body;
            
            const requiredFields = ['hash', 'clientFileId'];
            const missingFields = requiredFields.filter(field => !fileData[field]);
            
            if (missingFields.length > 0) {
                return res.status(400).json({
                    error: `Wymagane pola: ${missingFields.join(', ')}`
                });
            }
            
            // Zabezpieczenie przed pustym contentem
            if (fileData.content === undefined || fileData.content === null) {
                fileData.content = '';
            }
            
            const result = await SyncService.updateExistingFileOnServer(
                userId, 
                clientId, 
                fileId, 
                fileData
            );
            
            res.json({
                success: true,
                fileId: result.fileId,
                message: 'Plik zaktualizowany na serwerze'
            });
            
        } catch (error) {
            console.error('Błąd aktualizacji pliku na serwerze:', error);
            
            if (error.message.includes('nie znaleziony')) {
                return res.status(404).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas aktualizacji pliku na serwerze'
            });
        }
    }
    
    /**
     * KROK 2D: Potwierdza pobranie pliku przez klienta (po downlodzie z serwera)
     * POST /api/sync/files/:fileId/confirm-download/:clientId
     */
    async confirmFileDownloaded(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, fileId } = req.params;
            const clientFileInfo = req.body;
            
            const requiredFields = ['clientFileId', 'clientFileName', 'clientPath', 'clientLastModified'];
            const missingFields = requiredFields.filter(field => !clientFileInfo[field]);
            
            if (missingFields.length > 0) {
                return res.status(400).json({
                    error: `Wymagane pola: ${missingFields.join(', ')}`
                });
            }
            
            const result = await SyncService.confirmFileDownloaded(
                userId,
                clientId,
                fileId,
                clientFileInfo
            );
            
            res.json({
                success: true,
                message: 'Pobranie pliku potwierdzone'
            });
            
        } catch (error) {
            console.error('Błąd potwierdzenia pobrania pliku:', error);
            
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
    
    /**
     * KROK 2E: Potwierdza usunięcie pliku przez klienta (usuwa stan synchronizacji)
     * POST /api/sync/files/:fileId/confirm-delete/:clientId
     */
    async confirmFileDeletedOnClient(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, fileId } = req.params;
            
            const result = await SyncService.confirmFileDeletedOnClient(
                userId,
                clientId,
                fileId
            );
            
            res.json({
                success: true,
                message: 'Usunięcie pliku przez klienta potwierdzone'
            });
            
        } catch (error) {
            console.error('Błąd potwierdzenia usunięcia pliku:', error);
            
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
    
    /**
     * KROK 2F: Usuwa plik z serwera na żądanie klienta
     * DELETE /api/sync/files/:fileId/delete-from-server/:clientId
     */
    async deleteFileFromServer(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, fileId } = req.params;
            
            const result = await SyncService.deleteFileFromServer(
                userId,
                clientId,
                fileId
            );
            
            res.json({
                success: true,
                message: result.message || 'Plik usunięty z serwera'
            });
            
        } catch (error) {
            console.error('Błąd usuwania pliku z serwera:', error);
            
            if (error.message.includes('nie znaleziony')) {
                return res.status(404).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas usuwania pliku z serwera'
            });
        }
    }
    
    /**
     * KROK 3: Potwierdza zakończenie całej synchronizacji folderu
     * POST /api/sync/folders/:folderId/confirm/:clientId
     */
    async confirmSyncCompleted(req, res) {
        try {
            const userId = req.user.userId;
            const { clientId, folderId } = req.params;
            
            const result = await SyncService.confirmSyncCompleted(
                userId,
                clientId,
                folderId
            );
            
            res.json(result);
            
        } catch (error) {
            console.error('Błąd potwierdzenia zakończenia synchronizacji:', error);
            
            if (error.message.includes('nie znaleziony')) {
                return res.status(400).json({
                    error: error.message
                });
            }
            
            res.status(500).json({
                error: 'Błąd podczas potwierdzania zakończenia synchronizacji'
            });
        }
    }
    
    // ===== FUNKCJE POMOCNICZE =====
    
    /**
	 * Wyszukuje pliki po ID klienta (clientFileId)
	 * GET /api/sync/clients/:clientId/files/:clientFileId
	 */
	async findFileByClientId(req, res) {
		try {
			const userId = req.user.userId;
			const { clientId, clientFileId } = req.params;
			const { folderId } = req.query;
			
			const files = await SyncService.findFileByClientId(
				userId, 
				clientId, 
				clientFileId, 
				folderId
			);
			
			res.json({
				success: true,
				exists: files.length > 0,
				count: files.length,
				files: files
			});
			
		} catch (error) {
			console.error('Błąd wyszukiwania plików po clientId:', error);
			res.status(500).json({
				error: 'Błąd podczas wyszukiwania plików'
			});
		}
	}

	/**
	 * Wyszukuje pliki po nazwie i hashu
	 * GET /api/sync/folders/:folderId/find/:fileName/:fileHash
	 */
	async findFileByNameAndHash(req, res) {
		try {
			const userId = req.user.userId;
			const { folderId, fileName, fileHash } = req.params;
			
			const files = await SyncService.findFileByNameAndHash(
				userId, 
				folderId, 
				fileName, 
				fileHash
			);
			
			res.json({
				success: true,
				exists: files.length > 0,
				count: files.length,
				files: files
			});
			
		} catch (error) {
			console.error('Błąd wyszukiwania plików po nazwie i hashu:', error);
			res.status(500).json({
				error: 'Błąd podczas wyszukiwania plików'
			});
		}
	}
    
    // ===== ZARZĄDZANIE USTAWIENIAMI SYNCHRONIZACJI =====
    
    /**
     * Aktualizuje ustawienia synchronizacji (kierunek, ścieżka, aktywność)
     * PUT /api/sync/folders/:folderId/settings/:syncId
     */
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
                    error: 'Konfiguracja synchronizacji nie znaleziona'
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
}

module.exports = new SyncController();