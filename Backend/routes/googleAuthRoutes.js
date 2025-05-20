const express = require('express');
const router = express.Router();
const { googleAuth } = require('../controllers/googleAuthController');

router.post('/google', googleAuth);

module.exports = router;