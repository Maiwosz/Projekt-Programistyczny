const SyncService = require('../services/SyncService');

class SyncController {
    
    // === ZARZĄDZANIE KLIENTAMI ===
    
    async registerClient(req, res) {
        try {
            const client = await SyncService.registerClient(req.user.userId, req.body);
            res.status(201).json(client);
        } catch (error) {
            console.error('Błąd rejestracji klienta:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    async getClients(req, res) {
        try {
            const clients = await SyncService.getUserClients(req.user.userId, req.query);
            res.json(clients);
        } catch (error) {
            console.error('Błąd pobierania klientów:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    async deactivateClient(req, res) {
        try {
            const result = await SyncService.deactivateClient(req.user.userId, req.params.clientId);
            res.json(result);
        } catch (error) {
            console.error('Błąd dezaktywacji klienta:', error);
            res.status(404).json({ error: error.message });
        }
    }
    
    // === ZARZĄDZANIE SYNCHRONIZACJĄ FOLDERÓW ===
    
    async createSyncFolder(req, res) {
        try {
            const { folderId, clientConfigs } = req.body;
            const syncFolder = await SyncService.createSyncFolder(req.user.userId, folderId, clientConfigs);
            res.status(201).json(syncFolder);
        } catch (error) {
            console.error('Błąd tworzenia synchronizacji folderu:', error);
            res.status(400).json({ error: error.message });
        }
    }
    
    async getSyncFolders(req, res) {
        try {
            const syncFolders = await SyncService.getSyncFolders(req.user.userId, req.query);
            res.json(syncFolders);
        } catch (error) {
            console.error('Błąd pobierania synchronizacji folderów:', error);
            res.status(500).json({ error: error.message });
        }
    }
	
    async getSyncFoldersForFolder(req, res) {
        try {
            const { folderId } = req.params;
            const syncFolders = await SyncService.getSyncFolders(req.user.userId, { folderId });
            
            if (!syncFolders || syncFolders.length === 0) {
                return res.status(404).json({ 
                    error: 'Folder nie jest synchronizowany' 
                });
            }
            
            // Zwróć pierwszy (i jedyny) wynik - folder może mieć tylko jedną konfigurację sync
            res.json(syncFolders[0]);
        } catch (error) {
            console.error('Błąd pobierania synchronizacji folderu:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    async removeSyncFolder(req, res) {
        try {
            const { folderId } = req.params;
            const { clientId } = req.query;
            const result = await SyncService.removeSyncFolder(req.user.userId, folderId, clientId);
            res.json(result);
        } catch (error) {
            console.error('Błąd usuwania synchronizacji folderu:', error);
            res.status(404).json({ error: error.message });
        }
    }
    
    // === SYNCHRONIZACJA PLIKÓW ===
    
    async getFilesForSync(req, res) {
        try {
            const { folderId, clientId } = req.params;
            const files = await SyncService.getFilesForSync(
                req.user.userId, 
                folderId, 
                clientId, 
                req.query
            );
            res.json(files);
        } catch (error) {
            console.error('Błąd pobierania plików do synchronizacji:', error);
            res.status(404).json({ error: error.message });
        }
    }
    
    async syncFileFromClient(req, res) {
        try {
            const { clientId } = req.params;
            const file = await SyncService.syncFileFromClient(req.user.userId, clientId, req.body);
            res.json(file);
        } catch (error) {
            console.error('Błąd synchronizacji pliku od klienta:', error);
            res.status(400).json({ error: error.message });
        }
    }
    
    async batchSyncFiles(req, res) {
        try {
            const { clientId } = req.params;
            const { files } = req.body;
            
            const results = [];
            for (const fileData of files) {
                try {
                    const result = await SyncService.syncFileFromClient(req.user.userId, clientId, fileData);
                    results.push({ success: true, file: result });
                } catch (error) {
                    results.push({ success: false, error: error.message, fileData });
                }
            }
            
            res.json({ results });
        } catch (error) {
            console.error('Błąd synchronizacji wielu plików:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    // === SPRAWDZANIE SYNCHRONIZACJI ===
    
    async checkSyncStatus(req, res) {
        try {
            const { folderId, clientId } = req.params;
            const { files: clientFiles } = req.body;
            
            const serverFiles = await SyncService.getFilesForSync(req.user.userId, folderId, clientId);
            const syncResults = [];
            
            // Porównaj pliki klienta z serwerem
            for (const clientFile of clientFiles) {
                const serverFile = serverFiles.find(f => 
                    f.clientMappings.some(m => m.clientFileId === clientFile.clientFileId)
                );
                
                const syncNeeded = await SyncService.needsSync(serverFile, clientFile, clientId);
                if (syncNeeded) {
                    syncResults.push(syncNeeded);
                }
            }
            
            // Sprawdź czy są nowe pliki na serwerze
            for (const serverFile of serverFiles) {
                const hasClientMapping = serverFile.clientMappings.some(m => m.client.toString() === clientId);
                if (!hasClientMapping) {
                    syncResults.push({ direction: 'to-client', file: serverFile });
                }
            }
            
            res.json({ syncRequired: syncResults.length > 0, changes: syncResults });
        } catch (error) {
            console.error('Błąd sprawdzania statusu synchronizacji:', error);
            res.status(500).json({ error: error.message });
        }
    }
    
    // === UTILITY ENDPOINTS ===
    
    async updateClientLastSeen(req, res) {
        try {
            const { clientId } = req.params;
            const client = await SyncService.updateClientActivity(req.user.userId, clientId);
            res.json({ success: true, lastSeen: client.lastSeen });
        } catch (error) {
            console.error('Błąd aktualizacji aktywności klienta:', error);
            res.status(404).json({ error: error.message });
        }
    }
}

module.exports = new SyncController();