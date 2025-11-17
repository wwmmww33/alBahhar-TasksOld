const express = require('express');
const router = express.Router();
const commentNotificationController = require('../controllers/commentNotificationController');

// جلب إشعارات التعليقات للمستخدم
router.get('/user/:userId', commentNotificationController.getCommentNotifications);

// عدد الإشعارات غير المقروءة
router.get('/user/:userId/unread-count', commentNotificationController.getUnreadNotificationsCount);

// تحديد الإشعار كمقروء
router.put('/:notificationId/read', commentNotificationController.markNotificationAsRead);

// تحديد جميع الإشعارات كمقروءة
router.put('/user/:userId/mark-all-read', commentNotificationController.markAllNotificationsAsRead);

// عدد الإشعارات غير المقروءة لمهمة معينة
router.get('/task/:taskId/user/:userId/unread-count', commentNotificationController.getUnreadNotificationsCountForTask);

// تحديد إشعارات التعليقات كمقروءة لمهمة معينة
router.put('/task/:taskId/user/:userId/mark-read', commentNotificationController.markTaskCommentNotificationsAsRead);

module.exports = router;