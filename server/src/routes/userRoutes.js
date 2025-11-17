// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// المسارات الخاصة بالمستخدمين
router.get('/', userController.getAllUsers);
router.put('/:id', userController.updateUser);

// المسارات الخاصة بطلبات التسجيل
router.get('/requests', userController.getRegistrationRequests);
router.post('/requests/:id/approve', userController.approveRegistrationRequest);


module.exports = router;