const User = require('../models/User');
const syncManager = require('../services/sync/SyncManager');

exports.getActiveSyncProviders = async (req, res) => {
    try {
        const activeProviders = await syncManager.getUserActiveProviders(req.user.userId);
        res.json({ providers: activeProviders });
    } catch (error) {
        console.error('Błąd pobierania aktywnych providerów synchronizacji:', error);
        res.status(500).json({ error: 'Błąd pobierania statusu synchronizacji' });
    }
};

exports.syncWithProvider = async (req, res) => {
    try {
        const { provider } = req.params;
        const result = await syncManager.syncWithProvider(req.user.userId, provider);
        res.json(result);
    } catch (error) {
        console.error(`Błąd synchronizacji z ${req.params.provider}:`, error);
        res.status(500).json({ error: `Błąd synchronizacji: ${error.message}` });
    }
};

exports.syncAll = async (req, res) => {
    try {
        const results = await syncManager.syncAll(req.user.userId);
        res.json(results);
    } catch (error) {
        console.error('Błąd synchronizacji ze wszystkimi providerami:', error);
        res.status(500).json({ error: `Błąd synchronizacji: ${error.message}` });
    }
};

exports.disconnectProvider = async (req, res) => {
    try {
        const { provider } = req.params;
        const result = await syncManager.disconnectProvider(req.user.userId, provider);
        res.json(result);
    } catch (error) {
        console.error(`Błąd odłączania ${req.params.provider}:`, error);
        res.status(500).json({ error: `Błąd odłączania synchronizacji: ${error.message}` });
    }
};

exports.getAuthUrl = async (req, res) => {
    try {
        const { provider } = req.params;
        const result = syncManager.getAuthUrl(provider, req.user.userId);
        res.json(result);
    } catch (error) {
        console.error(`Błąd generowania URL autoryzacji dla ${req.params.provider}:`, error);
        res.status(500).json({ error: `Błąd generowania URL autoryzacji: ${error.message}` });
    }
};

exports.handleAuthCallback = async (req, res) => {
    try {
        const { provider } = req.params;
        const { code, state } = req.query;

        // State jest używany do identyfikacji użytkownika zamiast tokenu JWT
        const userId = state;
        
        // Sprawdź, czy userId jest prawidłowy
        if (!userId) {
            return res.status(400).json({ error: 'Brak identyfikatora użytkownika' });
        }

        const result = await syncManager.handleAuthCallback(provider, userId, { code });
        res.json(result);
    } catch (error) {
        console.error(`Błąd obsługi callbacku autoryzacji dla ${req.params.provider}:`, error);
        res.status(500).json({ error: `Błąd autoryzacji: ${error.message}` });
    }
};

exports.getSyncStatus = async (req, res) => {
    try {
        const { provider } = req.params;
        const providerInstance = await syncManager.getProvider(provider, req.user.userId);
        const status = await providerInstance.checkConnection();
        res.json(status);
    } catch (error) {
        console.error(`Błąd sprawdzania statusu synchronizacji ${req.params.provider}:`, error);
        res.status(500).json({ 
            connected: false, 
            error: `Błąd sprawdzania statusu synchronizacji: ${error.message}` 
        });
    }
};