// src/routes/profileRoutes.js
const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');

// المسارات الخاصة بالملف الشخصي
router.get('/:userId', profileController.getProfile);
router.put('/update', profileController.updateProfile);

module.exports = router;