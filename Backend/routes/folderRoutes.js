const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
    createFolder,
    getFolders,
    renameFolder,
    deleteFolder,
    getFolderContents,
    shareFolder,
    revokeSharedLink,
    isFolderShared,
    getSharedFolderContents
} = require('../controllers/folderController');

router.use(authMiddleware);

router.post('/', createFolder);
router.get('/', getFolders);
router.put('/:id', renameFolder);
router.delete('/:id', deleteFolder);
router.get('/:id/contents', getFolderContents);
router.get('/contents', getFolderContents);

router.post('/:id/share', shareFolder);
router.delete('/:id/revoke-share', revokeSharedLink);
router.get('/:id/is-shared', isFolderShared);

router.get('/shared/:sharedLink', getSharedFolderContents);



module.exports = router;