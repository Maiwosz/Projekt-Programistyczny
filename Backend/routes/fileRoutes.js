const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const fileController = require('../controllers/fileController');

router.post('/', authMiddleware, fileController.uploadFile);
router.post('/multiple', authMiddleware, fileController.uploadMultipleFiles);
router.get('/', authMiddleware, fileController.getUserFiles);
router.get('/:id/download', authMiddleware, fileController.downloadFile);
router.post('/download-multiple', authMiddleware, fileController.downloadMultipleFiles);
router.delete('/:id', authMiddleware, fileController.deleteFile);
router.get('/:id/metadata', authMiddleware, fileController.getFileMetadata);
router.put('/:id/metadata', authMiddleware, fileController.updateFileMetadata);

router.post('/restore/:id', authMiddleware, fileController.restoreFile);
router.get('/deleted', authMiddleware, fileController.getDeletedFiles);
router.delete('/trash/empty', authMiddleware, fileController.emptyTrash);
router.get('/:id/integrity', authMiddleware, fileController.checkFileIntegrity);
router.put('/:id/hash', authMiddleware, fileController.updateFileHash);

router.put('/:id', authMiddleware, fileController.renameFile);

router.post('/handle-duplicates', authMiddleware, fileController.handleDuplicates);

module.exports = router;