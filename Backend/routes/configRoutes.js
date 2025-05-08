const express = require('express');
const router = express.Router();
const { getClientConfig } = require('../controllers/configController');

router.get('/client-config', getClientConfig);

module.exports = router;