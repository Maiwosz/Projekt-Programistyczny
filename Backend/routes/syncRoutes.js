const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const syncController = require('../controllers/syncController');

// Endpoint callback NIE wymaga autoryzacji - musi być przed middleware!
router.get('/:provider/callback', syncController.handleAuthCallback);

// Wszystkie pozostałe endpointy wymagają autoryzacji
router.use(authMiddleware);

// Pobierz aktywnych providerów użytkownika
router.get('/providers', syncController.getActiveProviders);

// Endpointy dla konkretnego providera
router.get('/:provider/folders', syncController.getExternalFolders);
router.get('/:provider/status', syncController.checkConnection);
router.get('/:provider/auth-url', syncController.getAuthUrl);
router.delete('/:provider/disconnect', syncController.disconnectProvider);

// Zarządzanie parami synchronizacji
router.get('/pairs', syncController.getSyncPairs);
router.post('/:provider/pairs', syncController.createSyncPair);
router.delete('/:provider/pairs/:syncPairId', syncController.removeSyncPair);

// Synchronizacja
router.post('/:provider/sync-all', syncController.syncAllPairs);
router.post('/:provider/pairs/:syncPairId/sync', syncController.syncFolder);

module.exports = router;