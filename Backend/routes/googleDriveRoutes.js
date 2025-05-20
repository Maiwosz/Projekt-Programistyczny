const express = require('express');
const router = express.Router();
const googleDriveController = require('../controllers/googleDriveController');
const authMiddleware = require('../middleware/authMiddleware');

// Trasy dla autoryzacji
router.get('/auth', authMiddleware, googleDriveController.getAuthUrl);
router.get('/callback', authMiddleware, googleDriveController.handleCallback);

// Trasy dla synchronizacji
router.get('/check-connection', authMiddleware, googleDriveController.checkDriveConnection);
router.post('/sync-folders-from-drive', authMiddleware, googleDriveController.syncFoldersFromDrive);
router.post('/sync-folders-to-drive', authMiddleware, googleDriveController.syncFoldersToDrive);
router.post('/sync-files-from-drive', authMiddleware, googleDriveController.syncFilesFromDrive);
router.post('/sync-files-to-drive', authMiddleware, googleDriveController.syncFilesToDrive);
router.post('/disconnect', authMiddleware, googleDriveController.disconnectDrive);

module.exports = router;