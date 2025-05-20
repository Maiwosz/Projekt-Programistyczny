const express = require('express');
const router = express.Router();
const { facebookAuth } = require('../controllers/facebookAuthController');

router.post('/facebook', facebookAuth);

module.exports = router;