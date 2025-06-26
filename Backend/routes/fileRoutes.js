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

module.exports = router;