const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const googleDriveController = require('../controllers/googleDriveController');

// === ENDPOINTY BEZ AUTORYZACJI (muszą być PRZED middleware) ===

// Obsługa callback po autoryzacji (BEZ wymogu autoryzacji)
router.post('/callback', googleDriveController.handleCallback);
router.get('/callback', googleDriveController.handleCallback);

// === AUTORYZACJA (wymaga autoryzacji ale nie może być po middleware) ===

// Pobierz URL do autoryzacji Google Drive (wymaga autoryzacji)
router.get('/auth-url', authMiddleware, googleDriveController.getAuthUrl);

// === WSZYSTKIE POZOSTAŁE ENDPOINTY WYMAGAJĄ AUTORYZACJI ===

// STATUS POŁĄCZENIA
router.get('/status', authMiddleware, googleDriveController.getStatus);
router.post('/disconnect', authMiddleware, googleDriveController.disconnect);

// OPERACJE NA FOLDERACH
router.get('/folders', authMiddleware, googleDriveController.listFolders);
router.post('/folders', authMiddleware, googleDriveController.createFolder);

// SYNCHRONIZACJA - POPRAWIONE
router.post('/sync/to-drive', authMiddleware, googleDriveController.syncFolderToDrive);
router.post('/sync/from-drive', authMiddleware, googleDriveController.syncFolderFromDrive);
router.post('/sync/full', authMiddleware, googleDriveController.fullSync);
router.post('/sync', authMiddleware, googleDriveController.triggerManualSync);

// USTAWIENIA
router.get('/settings', authMiddleware, googleDriveController.getSettings);
router.put('/settings', authMiddleware, googleDriveController.updateSettings);

router.post('/setup', authMiddleware, googleDriveController.setupGoogleDriveSync);

module.exports = router;