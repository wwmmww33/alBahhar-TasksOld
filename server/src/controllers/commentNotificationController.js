const sql = require('mssql');
const dbConfig = require('../config/db.config');
const encryptionConfig = require('../config/encryption.config');

// جلب إشعارات التعليقات للمستخدم
const getCommentNotifications = async (req, res) => {
    try {
        const { userId } = req.params;
        const { unreadOnly = false } = req.query;
        
        const pool = await sql.connect(dbConfig);
        
        let query = `
            SELECT 
                cn.NotificationID,
                cn.CommentID,
                cn.TaskID,
                cn.CommentedByUserID,
                cn.NotifyUserID,
                cn.NotificationType,
                cn.IsRead,
                cn.CreatedAt,
                cn.ReadAt,
                c.Content as CommentContent,
                t.Title as TaskTitle,
                u.FullName as CommentedByUsername
            FROM CommentNotifications cn
            INNER JOIN Comments c ON cn.CommentID = c.CommentID
            INNER JOIN Tasks t ON cn.TaskID = t.TaskID
            INNER JOIN Users u ON cn.CommentedByUserID = u.UserID
            WHERE cn.NotifyUserID = @userId
        `;
        
        if (unreadOnly === 'true') {
            query += ' AND cn.IsRead = 0';
        }
        
        query += ' ORDER BY cn.CreatedAt DESC';
        
        const request = pool.request();
        request.input('userId', sql.NVarChar, userId);
        
        const result = await request.query(query);
        const notifications = result.recordset.map(n => {
            if (n.TaskTitle) {
                try { n.TaskTitle = encryptionConfig.decrypt(n.TaskTitle); } catch (e) {}
            }
            return n;
        });
        
        res.json({
            success: true,
            notifications
        });
        
    } catch (error) {
        console.error('خطأ في جلب إشعارات التعليقات:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب إشعارات التعليقات',
            error: error.message
        });
    }
};

// عدد الإشعارات غير المقروءة
const getUnreadNotificationsCount = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        request.input('userId', sql.NVarChar, userId);
        
        const result = await request.query(`
            SELECT COUNT(*) as UnreadCount
            FROM CommentNotifications
            WHERE NotifyUserID = @userId AND IsRead = 0
        `);
        
        res.json({
            success: true,
            unreadCount: result.recordset[0].UnreadCount
        });
        
    } catch (error) {
        console.error('خطأ في جلب عدد الإشعارات غير المقروءة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب عدد الإشعارات غير المقروءة',
            error: error.message
        });
    }
};

// تحديد الإشعار كمقروء
const markNotificationAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        
        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        request.input('notificationId', sql.Int, notificationId);
        
        await request.query(`
            UPDATE CommentNotifications 
            SET IsRead = 1, ReadAt = GETDATE()
            WHERE NotificationID = @notificationId
        `);
        
        res.json({
            success: true,
            message: 'تم تحديد الإشعار كمقروء'
        });
        
    } catch (error) {
        console.error('خطأ في تحديد الإشعار كمقروء:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تحديد الإشعار كمقروء',
            error: error.message
        });
    }
};

// تحديد جميع الإشعارات كمقروءة
const markAllNotificationsAsRead = async (req, res) => {
    try {
        const { userId } = req.params;
        
        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        request.input('userId', sql.NVarChar, userId);
        
        await request.query(`
            UPDATE CommentNotifications 
            SET IsRead = 1, ReadAt = GETDATE()
            WHERE NotifyUserID = @userId AND IsRead = 0
        `);
        
        res.json({
            success: true,
            message: 'تم تحديد جميع الإشعارات كمقروءة'
        });
        
    } catch (error) {
        console.error('خطأ في تحديد جميع الإشعارات كمقروءة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تحديد جميع الإشعارات كمقروءة',
            error: error.message
        });
    }
};

// عدد الإشعارات غير المقروءة لمهمة معينة
const getUnreadNotificationsCountForTask = async (req, res) => {
    try {
        const { taskId, userId } = req.params;
        
        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        request.input('taskId', sql.Int, taskId);
        request.input('userId', sql.NVarChar, userId);
        
        const result = await request.query(`
            SELECT COUNT(*) as count
            FROM CommentNotifications
            WHERE TaskID = @taskId AND NotifyUserID = @userId AND IsRead = 0
        `);
        
        res.json({
            success: true,
            count: result.recordset[0].count
        });
        
    } catch (error) {
        console.error('خطأ في جلب عدد إشعارات التعليقات للمهمة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب عدد إشعارات التعليقات للمهمة',
            error: error.message
        });
    }
};

// تحديد جميع إشعارات التعليقات كمقروءة لمهمة معينة ومستخدم معين
const markTaskCommentNotificationsAsRead = async (req, res) => {
    try {
        const { taskId, userId } = req.params;
        
        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        request.input('taskId', sql.Int, taskId);
        request.input('userId', sql.NVarChar, userId);
        
        const result = await request.query(`
            UPDATE CommentNotifications 
            SET IsRead = 1, ReadAt = GETDATE()
            WHERE TaskID = @taskId AND NotifyUserID = @userId AND IsRead = 0
        `);
        
        res.json({
            success: true,
            message: 'تم تحديث إشعارات التعليقات كمقروءة بنجاح',
            updatedCount: result.rowsAffected[0]
        });
        
    } catch (error) {
        console.error('خطأ في تحديث إشعارات التعليقات للمهمة:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تحديث إشعارات التعليقات للمهمة',
            error: error.message
        });
    }
};

module.exports = {
    getCommentNotifications,
    getUnreadNotificationsCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    getUnreadNotificationsCountForTask,
    markTaskCommentNotificationsAsRead
};