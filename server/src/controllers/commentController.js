// src/controllers/commentController.js
const sql = require('mssql');
const encryptionConfig = require('../config/encryption.config');

exports.createComment = async (req, res) => {
    const pool = req.app.locals.db;
    const { TaskID, UserID, Content, CreatedAt } = req.body;

    if (!TaskID || !UserID || !Content) {
        return res.status(400).json({ message: 'TaskID, UserID, and Content are required.' });
    }

    try {
        // استخدام التاريخ المخصص إذا تم تمريره، وإلا استخدام التوقيت الحالي
        const commentCreatedAt = CreatedAt ? new Date(CreatedAt) : new Date();
        
        // التحقق من صحة التاريخ المخصص
        if (CreatedAt && isNaN(commentCreatedAt.getTime())) {
            return res.status(400).json({ message: 'Invalid CreatedAt date format.' });
        }

        // إدراج التعليق بدون OUTPUT clause لتجنب تعارض مع trigger
        await pool.request()
            .input('TaskID', sql.Int, TaskID)
            .input('UserID', sql.NVarChar, UserID)
            .input('Content', sql.NVarChar, encryptionConfig.encrypt(Content))
            .input('CreatedAt', sql.DateTime, commentCreatedAt)
            .query(`
                INSERT INTO Comments (TaskID, UserID, Content, CreatedAt)
                VALUES (@TaskID, @UserID, @Content, @CreatedAt);
            `);
        
        // جلب التعليق المضاف حديثاً
        const result = await pool.request()
            .input('TaskID2', sql.Int, TaskID)
            .input('UserID2', sql.NVarChar, UserID)
            .input('CreatedAt2', sql.DateTime, commentCreatedAt)
            .query(`
                SELECT TOP 1 * FROM Comments 
                WHERE TaskID = @TaskID2 AND UserID = @UserID2 AND CreatedAt = @CreatedAt2
                ORDER BY CommentID DESC;
            `);
        
        const newComment = result.recordset[0];
        if (newComment && newComment.Content) {
            try { newComment.Content = encryptionConfig.decrypt(newComment.Content); } catch (e) {}
        }
        // إنشاء إشعارات التعليقات كحل احتياطي في حال لم يُنفّذ المشغل على القاعدة
        const notifRequest = pool.request()
            .input('CommentID', sql.Int, newComment.CommentID)
            .input('TaskID', sql.Int, newComment.TaskID)
            .input('CommentedByUserID', sql.NVarChar, newComment.UserID)
            .input('CreatedAt', sql.DateTime, newComment.CreatedAt);

        await notifRequest.query(`
            -- إشعار لمنشئ المهمة
            INSERT INTO CommentNotifications (CommentID, TaskID, CommentedByUserID, NotifyUserID, NotificationType, IsRead, CreatedAt)
            SELECT @CommentID, @TaskID, @CommentedByUserID, t.CreatedBy, 'task_creator', 0, @CreatedAt
            FROM Tasks t
            WHERE t.TaskID = @TaskID
              AND t.CreatedBy <> @CommentedByUserID
              AND NOT EXISTS (
                  SELECT 1 FROM CommentNotifications cn
                  WHERE cn.CommentID = @CommentID AND cn.NotifyUserID = t.CreatedBy
              );

            -- إشعارات للمشاركين السابقين في التعليقات (تعليقات أقدم على نفس المهمة)
            INSERT INTO CommentNotifications (CommentID, TaskID, CommentedByUserID, NotifyUserID, NotificationType, IsRead, CreatedAt)
            SELECT DISTINCT @CommentID, @TaskID, @CommentedByUserID, c.UserID, 'task_participant', 0, @CreatedAt
            FROM Comments c
            WHERE c.TaskID = @TaskID
              AND c.UserID <> @CommentedByUserID
              AND c.CommentID < @CommentID
              AND c.UserID NOT IN (SELECT CreatedBy FROM Tasks WHERE TaskID = @TaskID)
              AND NOT EXISTS (
                  SELECT 1 FROM CommentNotifications cn
                  WHERE cn.CommentID = @CommentID AND cn.NotifyUserID = c.UserID
              );

            -- إشعار لمكلّف المهمة الرئيسية
            INSERT INTO CommentNotifications (CommentID, TaskID, CommentedByUserID, NotifyUserID, NotificationType, IsRead, CreatedAt)
            SELECT DISTINCT @CommentID, @TaskID, @CommentedByUserID, t.AssignedTo, 'task_assignee', 0, @CreatedAt
            FROM Tasks t
            WHERE t.TaskID = @TaskID
              AND t.AssignedTo IS NOT NULL
              AND t.AssignedTo <> @CommentedByUserID
              AND NOT EXISTS (
                  SELECT 1 FROM CommentNotifications cn
                  WHERE cn.CommentID = @CommentID AND cn.NotifyUserID = t.AssignedTo
              );

            -- إشعارات لمكلّفي المهام الفرعية لنفس المهمة
            INSERT INTO CommentNotifications (CommentID, TaskID, CommentedByUserID, NotifyUserID, NotificationType, IsRead, CreatedAt)
            SELECT DISTINCT @CommentID, @TaskID, @CommentedByUserID, s.AssignedTo, 'subtask_assignee', 0, @CreatedAt
            FROM Subtasks s
            WHERE s.TaskID = @TaskID
              AND s.AssignedTo IS NOT NULL
              AND s.AssignedTo <> @CommentedByUserID
              AND NOT EXISTS (
                  SELECT 1 FROM CommentNotifications cn
                  WHERE cn.CommentID = @CommentID AND cn.NotifyUserID = s.AssignedTo
              );

            -- إشعارات لمنشئي المهام الفرعية لنفس المهمة
            INSERT INTO CommentNotifications (CommentID, TaskID, CommentedByUserID, NotifyUserID, NotificationType, IsRead, CreatedAt)
            SELECT DISTINCT @CommentID, @TaskID, @CommentedByUserID, s.CreatedBy, 'subtask_creator', 0, @CreatedAt
            FROM Subtasks s
            WHERE s.TaskID = @TaskID
              AND s.CreatedBy IS NOT NULL
              AND s.CreatedBy <> @CommentedByUserID
              AND NOT EXISTS (
                  SELECT 1 FROM CommentNotifications cn
                  WHERE cn.CommentID = @CommentID AND cn.NotifyUserID = s.CreatedBy
              );
        `);
        // إزالة القوس الزائد وضمان استمرار التنفيذ
        res.status(201).json(newComment);
    } catch (error) {
        console.error("CREATE COMMENT ERROR:", error);
        res.status(500).send({ message: 'Error creating comment' });
    }
};