const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');
const upload = require('../middleware/uploadMiddleware'); // Załaduj middleware do uploadu plików, jeśli masz

router.use(authMiddleware);

router.get('/email', userController.getCurrentUserEmail);
router.get('/login', userController.getCurrentUserLogin);
router.get('/profile-picture', userController.getCurrentUserProfilePicture);

router.put('/email', userController.updateCurrentUserEmail);
router.put('/login', userController.updateCurrentUserLogin);
router.put('/profile-picture', userController.updateCurrentUserProfilePicture);
router.put('/password', userController.updateCurrentUserPassword);


router.delete('/:id', userController.deleteUser);
router.post('/profile-picture', upload.single('file'), userController.uploadProfilePicture);

module.exports = router;
