// syncRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const syncController = require('../controllers/syncController');

// Pobierz listę aktywnych providerów synchronizacji
router.get('/providers', authMiddleware, syncController.getActiveSyncProviders);

// Uruchom synchronizację z określonym providerem
router.post('/:provider', authMiddleware, syncController.syncWithProvider);

// Uruchom synchronizację ze wszystkimi aktywnymi providerami
router.post('/all', authMiddleware, syncController.syncAll);

// Odłącz określony provider synchronizacji
router.delete('/:provider', authMiddleware, syncController.disconnectProvider);

// Pobierz URL autoryzacji dla określonego providera
router.get('/:provider/auth', authMiddleware, syncController.getAuthUrl);

// Obsłuż callback autoryzacji dla określonego providera - BEZ middleware uwierzytelniającego
router.get('/:provider/callback', syncController.handleAuthCallback);

// Sprawdź status połączenia z określonym providerem
router.get('/:provider/status', authMiddleware, syncController.getSyncStatus);

module.exports = router;