const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
    createFolder,
    getFolders,
    renameFolder,
    deleteFolder,
    addPhotoToFolder,
    removePhotoFromFolder
} = require('../controllers/folderController');

router.use(authMiddleware);

router.post('/', authMiddleware, createFolder);
router.get('/', authMiddleware, getFolders);
router.put('/:id', authMiddleware, renameFolder);
router.delete('/:id', authMiddleware, deleteFolder);

router.post('/add-photo', addPhotoToFolder);
router.post('/remove-photo', removePhotoFromFolder);

module.exports = router;
