const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');

router.use(authMiddleware);

router.post('/profile-picture', userController.uploadProfilePicture);
router.get('/email', userController.getCurrentUserEmail);
router.get('/login', userController.getCurrentUserLogin);
router.get('/profile-picture', userController.getCurrentUserProfilePicture);

router.put('/email', userController.updateCurrentUserEmail);
router.put('/login', userController.updateCurrentUserLogin);
router.put('/profile-picture', userController.updateCurrentUserProfilePicture);
router.put('/password', userController.updateCurrentUserPassword);

router.delete('/', userController.deleteUser);


module.exports = router;
