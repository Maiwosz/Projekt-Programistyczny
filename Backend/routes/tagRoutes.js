// routes/tagRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const tagController = require('../controllers/tagController');

router.use(authMiddleware);

router.post('/', tagController.createTag);
router.get('/', tagController.getUserTags);
router.put('/', tagController.assignTagToFile);
router.delete('/:tagId', tagController.deleteTag);

router.post('/assign', tagController.assignTagToFile);
router.delete('/remove/:fileId/:tagId', tagController.removeTagFromFile);
router.get('/file/:fileId', tagController.getFileTags);
router.get('/files', tagController.getFilesByTags);

module.exports = router;