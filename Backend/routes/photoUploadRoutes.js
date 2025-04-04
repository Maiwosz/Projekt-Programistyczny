const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { uploadPhoto, getUserPhotos } = require('../controllers/photoController');

router.post('/', authMiddleware, uploadPhoto);
router.get('/', authMiddleware, getUserPhotos);

module.exports = router;