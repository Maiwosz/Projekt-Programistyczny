const SyncManager = require('../services/sync/SyncManager');
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
        
        // Zweryfikuj state (np. odszyfruj JWT)
        const decoded = jwt.verify(state, process.env.JWT_SECRET);
        const userId = decoded.userId;

        const result = await SyncManager.handleAuthCallback(provider, userId, req.query);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};