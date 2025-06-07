const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const syncController = require('../controllers/syncController');

// Wszystkie endpointy wymagają autoryzacji
router.use(authMiddleware);

// === ZARZĄDZANIE KLIENTAMI ===

// Rejestracja nowego klienta
router.post('/clients', syncController.registerClient);

// Pobieranie informacji o kliencie
router.get('/clients/:clientId', syncController.getClient);

// Aktualizacja aktywności klienta (heartbeat)
router.put('/clients/:clientId/activity', syncController.updateClientActivity);

// === KONFIGURACJA SYNCHRONIZACJI FOLDERÓW ===

// Dodanie folderu do synchronizacji
router.post('/folders', syncController.addSyncFolder);

// Usunięcie folderu z synchronizacji
router.delete('/folders/:folderId', syncController.removeSyncFolder);

// === SYNCHRONIZACJA - GŁÓWNY INTERFEJS ===

// Pobieranie stanu synchronizacji folderu dla klienta
router.get('/folders/:folderId/state/:clientId', syncController.getFolderSyncState);

// Potwierdzenie zakończenia synchronizacji
router.post('/folders/:folderId/confirm/:clientId', syncController.confirmSyncCompleted);

// === OPERACJE NA PLIKACH PODCZAS SYNCHRONIZACJI ===

// Pobieranie pliku do synchronizacji (z zawartością)
router.get('/files/:fileId/download/:clientId', syncController.downloadFileForSync);

// Potwierdzenie pobrania pliku przez klienta
router.post('/files/:fileId/confirm-download/:clientId', syncController.confirmFileDownloaded);

// Potwierdzenie usunięcia pliku przez klienta
router.post('/files/:fileId/confirm-delete/:clientId', syncController.confirmFileDeleted);

// === OZNACZANIE PLIKÓW DO SYNCHRONIZACJI ===

// Oznaczanie pojedynczego pliku do synchronizacji
router.post('/files/:fileId/mark', syncController.markFileForSync);

// Oznaczanie całego folderu do synchronizacji
router.post('/folders/:folderId/mark', syncController.markFolderForSync);

// === ZARZĄDZANIE SYNCHRONIZACJAMI FOLDERÓW - INTERFEJS WEBOWY ===

// Pobieranie listy synchronizacji dla folderu
router.get('/folders/:folderId/syncs', syncController.getFolderSyncs);

// Pobieranie szczegółów konkretnej synchronizacji
router.get('/folders/:folderId/syncs/:syncId', syncController.getSyncDetails);

// Aktualizacja ustawień synchronizacji
router.put('/folders/:folderId/syncs/:syncId', syncController.updateSyncSettings);

// Usunięcie synchronizacji
router.delete('/folders/:folderId/syncs/:syncId', syncController.deleteSyncFolder);

module.exports = router;