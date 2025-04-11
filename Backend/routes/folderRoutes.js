const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
    createFolder,
    getFolders,
    renameFolder,
    deleteFolder,
    getFolderContents
} = require('../controllers/folderController');

router.use(authMiddleware);

router.post('/', createFolder);
router.get('/', getFolders);
router.put('/:id', renameFolder);
router.delete('/:id', deleteFolder);
router.get('/:id/contents', getFolderContents);
router.get('/contents', getFolderContents);

module.exports = router;