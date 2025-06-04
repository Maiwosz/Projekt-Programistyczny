// routes/fileFilterRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const fileFilterController = require('../controllers/fileFilterController');

router.use(authMiddleware);

// Main filtering endpoint
router.get('/', fileFilterController.filterFiles);

// Get available filter options (tags, categories, counts)
router.get('/options', fileFilterController.getFilterOptions);

// Advanced text search
router.get('/search', fileFilterController.searchFiles);

module.exports = router;