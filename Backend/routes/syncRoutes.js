const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const syncController = require('../controllers/syncController');

// Wszystkie endpointy wymagają autoryzacji
router.use(authMiddleware);

// === ZARZĄDZANIE KLIENTAMI ===

// Rejestracja i zarządzanie klientami
router.post('/clients', syncController.registerClient);
router.get('/clients', syncController.getClients);
router.delete('/clients/:clientId', syncController.deactivateClient);

// Aktualizacja aktywności klienta
router.put('/clients/:clientId/activity', syncController.updateClientLastSeen);

// === ZARZĄDZANIE FOLDERAMI SYNCHRONIZACJI ===

// CRUD dla folderów synchronizacji
router.post('/folders', syncController.createSyncFolder);
router.get('/folders', syncController.getSyncFolders);
router.delete('/folders/:folderId', syncController.removeSyncFolder);

// Synchronizacja dla konkretnego folderu
router.get('/folders/:folderId/sync', syncController.getSyncFoldersForFolder);

// === OPERACJE NA PLIKACH ===

// Pobieranie plików do synchronizacji
router.get('/folders/:folderId/files/:clientId', syncController.getFilesForSync);

// Synchronizacja plików z klienta
router.post('/files/sync/:clientId', syncController.syncFileFromClient);

// Batch synchronizacja wielu plików
router.post('/files/batch-sync/:clientId', syncController.batchSyncFiles);

// Sprawdzanie statusu synchronizacji
router.post('/folders/:folderId/sync-status/:clientId', syncController.checkSyncStatus);

module.exports = router;