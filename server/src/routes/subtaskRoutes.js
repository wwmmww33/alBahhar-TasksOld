// src/routes/subtaskRoutes.js
const express = require('express');
const router = express.Router();
const subtaskController = require('../controllers/subtaskController');

router.get('/', subtaskController.getAllSubtasks);
router.post('/', subtaskController.createSubtask);
router.patch('/:subtaskId', subtaskController.updateSubtaskStatus);
router.patch('/:subtaskId/assign', subtaskController.assignSubtask);
// تحديث نص المهمة الفرعية وتاريخ الاستحقاق
router.patch('/:subtaskId/details', subtaskController.updateSubtaskDetails);
// تبديل إظهار المهمة الفرعية في التقويم
router.patch('/:subtaskId/calendar', subtaskController.updateSubtaskCalendarFlag);
router.delete('/:subtaskId', subtaskController.deleteSubtask);
module.exports = router;