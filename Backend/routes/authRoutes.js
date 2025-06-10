const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getCurrentUser, refreshToken } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/refresh', refreshToken);

router.get('/me', authMiddleware, getCurrentUser);

module.exports = router;