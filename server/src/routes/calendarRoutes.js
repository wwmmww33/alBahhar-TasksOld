// src/routes/calendarRoutes.js
const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');

// GET /api/calendar/subtasks?userId=...
router.get('/subtasks', calendarController.getDepartmentCalendarSubtasks);

// أحداث خاصة للمستخدم
// GET /api/calendar/personal-events?userId=...&startDate=...&days=...
router.get('/personal-events', calendarController.getPersonalEvents);
// POST /api/calendar/personal-events
router.post('/personal-events', calendarController.createPersonalEvent);

module.exports = router;