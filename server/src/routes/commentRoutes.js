
// src/routes/commentRoutes.js
const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');

// POST /api/comments
router.post('/', commentController.createComment);

module.exports = router;