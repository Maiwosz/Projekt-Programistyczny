const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const GoogleDriveController = require('../controllers/googleDriveController');

// ZMIANA: Utwórz instancję kontrolera
const googleDriveController = new GoogleDriveController();

// === ENDPOINTY BEZ AUTORYZACJI ===
// Callback po autoryzacji Google (nie wymaga middleware autoryzacji)
router.post('/callback', (req, res) => googleDriveController.handleCallback(req, res));
router.get('/callback', (req, res) => googleDriveController.handleCallback(req, res));

// === AUTORYZACJA (wymaga autoryzacji użytkownika) ===
// Pobierz URL do autoryzacji Google Drive
router.get('/auth-url', authMiddleware, (req, res) => googleDriveController.getAuthUrl(req, res));

// === ZARZĄDZANIE POŁĄCZENIEM ===
// Status połączenia z Google Drive
router.get('/status', authMiddleware, (req, res) => googleDriveController.getConnectionStatus(req, res));

// Rozłącz z Google Drive
router.post('/disconnect', authMiddleware, (req, res) => googleDriveController.disconnect(req, res));

// Diagnostyka połączenia
router.get('/diagnostics', authMiddleware, (req, res) => googleDriveController.getDiagnostics(req, res));

// === USTAWIENIA SYNCHRONIZACJI ===
// Pobierz ustawienia synchronizacji
router.get('/sync/settings', authMiddleware, (req, res) => googleDriveController.getSyncSettings(req, res));

// Zaktualizuj ustawienia synchronizacji
router.put('/sync/settings', authMiddleware, (req, res) => googleDriveController.updateSyncSettings(req, res));

// === SYNCHRONIZACJA ===
// Ręczna synchronizacja
router.post('/sync/manual', authMiddleware, (req, res) => googleDriveController.triggerManualSync(req, res));

// Włącz automatyczną synchronizację
router.post('/sync/auto/start', authMiddleware, (req, res) => googleDriveController.startAutoSync(req, res));

// Wyłącz automatyczną synchronizację
router.post('/sync/auto/stop', authMiddleware, (req, res) => googleDriveController.stopAutoSync(req, res));

// === OPERACJE NA FOLDERACH GOOGLE DRIVE ===
// Lista folderów w Google Drive
router.get('/folders', authMiddleware, (req, res) => googleDriveController.listDriveFolders(req, res));

// Utwórz nowy folder w Google Drive
router.post('/folders', authMiddleware, (req, res) => googleDriveController.createDriveFolder(req, res));

// Utwórz synchronizację folderu z Google Drive
router.post('/sync/folder', authMiddleware, (req, res) => googleDriveController.createSyncFolder(req, res));

module.exports = router;