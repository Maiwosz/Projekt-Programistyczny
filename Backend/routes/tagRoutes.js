const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {

} = require('../controllers/tagController');

router.use(authMiddleware);

router.post('/', createTag);

module.exports = router;