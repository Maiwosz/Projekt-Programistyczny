const SyncManager = require('../services/sync/SyncManager');
const AutoSyncScheduler = require('../services/sync/AutoSyncScheduler');
const jwt = require('jsonwebtoken');

// Pobierz dostępnych providerów dla użytkownika
exports.getActiveProviders = async (req, res) => {
    try {
        const providers = await SyncManager.getUserActiveProviders(req.user.userId);
        res.json({ providers });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Pobierz foldery z zewnętrznego providera
exports.getExternalFolders = async (req, res) => {
    try {
        const { provider } = req.params;
        const { parentId } = req.query;
        
        const folders = await SyncManager.getExternalFolders(provider, req.user.userId, parentId);
        res.json({ folders });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Utwórz parę synchronizacji
exports.createSyncPair = async (req, res) => {
    try {
        const { provider } = req.params;
        const { localFolderId, externalFolderId, syncDirection } = req.body;
        
        const syncPair = await SyncManager.createSyncPair(
            provider, 
            req.user.userId, 
            localFolderId, 
            externalFolderId, 
            syncDirection
        );
        
        res.status(201).json(syncPair);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Usuń parę synchronizacji
exports.removeSyncPair = async (req, res) => {
    try {
        const { provider, syncPairId } = req.params;
        
        const result = await SyncManager.removeSyncPair(provider, req.user.userId, syncPairId);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Pobierz wszystkie pary synchronizacji użytkownika
exports.getSyncPairs = async (req, res) => {
    try {
        const { provider } = req.query;
        
        const syncPairs = await SyncManager.getUserSyncPairs(req.user.userId, provider);
        res.json({ syncPairs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Synchronizuj konkretną parę folderów
exports.syncFolder = async (req, res) => {
    try {
        const { provider, syncPairId } = req.params;
        
        const result = await SyncManager.syncFolder(provider, req.user.userId, syncPairId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Synchronizuj wszystkie pary dla providera
exports.syncAllPairs = async (req, res) => {
    try {
        const { provider } = req.params;
        
        const results = await SyncManager.syncAllPairs(provider, req.user.userId);
        res.json({ results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Sprawdź status połączenia z providerem
exports.checkConnection = async (req, res) => {
    try {
        const { provider } = req.params;
        
        const providerInstance = await SyncManager.getProvider(provider, req.user.userId);
        const status = await providerInstance.checkConnection();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Rozłącz providera
exports.disconnectProvider = async (req, res) => {
    try {
        const { provider } = req.params;
        
        const result = await SyncManager.disconnectProvider(req.user.userId, provider);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Pobierz URL autoryzacji dla providera
exports.getAuthUrl = async (req, res) => {
    try {
        const { provider } = req.params;
        
        // Generuj state z userId
        const state = jwt.sign(
            { userId: req.user.userId },
            process.env.JWT_SECRET,
            { expiresIn: '10m' }
        );

        const authUrl = await SyncManager.getAuthUrl(provider, state); // Przekaż state
        res.json({ authUrl });
        
    } catch (error) {
        console.error('Błąd generowania URL autoryzacji:', error);
        res.status(500).json({ error: error.message });
    }
};

// Obsługa callbacku autoryzacji
exports.handleAuthCallback = async (req, res) => {
    try {
        const { provider } = req.params; // provider z URL
        const { state } = req.query; // state z query params
        
        console.log('Auth callback received:', { provider, hasState: !!state }); // Debug
        
        // Zweryfikuj state (np. odszyfruj JWT)
        const decoded = jwt.verify(state, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const result = await SyncManager.handleAuthCallback(provider, userId, req.query);
        console.log('Auth callback result:', result); // Debug
        
        res.json(result);
    } catch (error) {
        console.error('Auth callback error:', error); // Debug
        res.status(400).json({ error: error.message });
    }
};

// Włącz automatyczną synchronizację dla pary
exports.enableAutoSync = async (req, res) => {
    try {
        const { syncPairId } = req.params;
        const { intervalMinutes = 60 } = req.body;
        
        const result = await AutoSyncScheduler.enableAutoSync(syncPairId, intervalMinutes);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Wyłącz automatyczną synchronizację dla pary
exports.disableAutoSync = async (req, res) => {
    try {
        const { syncPairId } = req.params;
        
        const result = await AutoSyncScheduler.disableAutoSync(syncPairId);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Zaktualizuj interwał automatycznej synchronizacji
exports.updateAutoSyncInterval = async (req, res) => {
    try {
        const { syncPairId } = req.params;
        const { intervalMinutes } = req.body;
        
        if (!intervalMinutes || intervalMinutes < 5) {
            return res.status(400).json({ error: 'Interwał musi być co najmniej 5 minut' });
        }
        
        const result = await AutoSyncScheduler.updateSyncInterval(syncPairId, intervalMinutes);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Pobierz status automatycznej synchronizacji
exports.getAutoSyncStatus = async (req, res) => {
    try {
        const status = await AutoSyncScheduler.getAutoSyncStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Zaktualizuj ustawienia synchronizacji dla pary (włączając usuwanie)
exports.updateSyncPairSettings = async (req, res) => {
    try {
        const { syncPairId } = req.params;
        const { 
            syncDirection,
            autoSync,
            deleteSync,
            fileFilters,
            syncSubfolders  // DODAJ TO
        } = req.body;
        
        const SyncPair = require('../models/SyncPair');
        
        const syncPair = await SyncPair.findOne({
            _id: syncPairId,
            user: req.user.userId
        });
        
        if (!syncPair) {
            return res.status(404).json({ error: 'Para synchronizacji nie znaleziona' });
        }
        
        // Aktualizuj ustawienia
        if (syncDirection) {
            syncPair.syncDirection = syncDirection;
        }
        
        if (autoSync !== undefined) {
            syncPair.autoSync = { ...syncPair.autoSync, ...autoSync };
            
            // DODAJ: Jeśli włączamy auto-sync, zaplanuj następną synchronizację
            if (autoSync.enabled && autoSync.intervalMinutes) {
                const nextSync = new Date();
                nextSync.setMinutes(nextSync.getMinutes() + autoSync.intervalMinutes);
                syncPair.autoSync.nextAutoSync = nextSync;
            }
        }
        
        if (deleteSync !== undefined) {
            syncPair.deleteSync = { ...syncPair.deleteSync, ...deleteSync };
        }
        
        if (fileFilters !== undefined) {
            syncPair.fileFilters = { ...syncPair.fileFilters, ...fileFilters };
        }
        
        // DODAJ TO
        if (syncSubfolders !== undefined) {
            syncPair.syncSubfolders = syncSubfolders;
        }
        
        await syncPair.save();
        
        // DODAJ: Jeśli włączamy auto-sync, zarejestruj w schedulerze
        if (autoSync?.enabled) {
            const AutoSyncScheduler = require('../services/sync/AutoSyncScheduler');
            await AutoSyncScheduler.enableAutoSync(syncPairId, autoSync.intervalMinutes);
        } else if (autoSync?.enabled === false) {
            const AutoSyncScheduler = require('../services/sync/AutoSyncScheduler');
            await AutoSyncScheduler.disableAutoSync(syncPairId);
        }
        
        res.json(syncPair);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

exports.getSyncPairDetails = async (req, res) => {
    try {
        const { syncPairId } = req.params;
        const SyncPair = require('../models/SyncPair');
        
        const syncPair = await SyncPair.findOne({
            _id: syncPairId,
            user: req.user.userId
        }).populate('localFolder', 'name path')
          .populate('user', 'email');
        
        if (!syncPair) {
            return res.status(404).json({ error: 'Para synchronizacji nie znaleziona' });
        }
        
        res.json(syncPair);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.checkConnection = async (req, res) => {
    try {
        const { provider } = req.params;
        
        const providerInstance = await SyncManager.getProvider(provider, req.user.userId);
        const isConnected = await providerInstance.checkConnection();
        
        res.json({ 
            connected: isConnected,
            provider: provider 
        });
    } catch (error) {
        console.error('Connection check error:', error);
        res.json({ 
            connected: false,
            provider: req.params.provider,
            error: error.message 
        });
    }
};