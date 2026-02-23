// src/controllers/commentController.js
const sql = require('mssql');
const encryptionConfig = require('../config/encryption.config');
const { hasActiveDelegation } = require('../utils/delegationUtils');

exports.createComment = async (req, res) => {
    const pool = req.app.locals.db;
    const { TaskID, UserID, ActedBy, Content, CreatedAt, ShowInCalendar } = req.body;

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

        let actorUserId = null;
        if (ActedBy && ActedBy !== UserID) {
            try {
                const taskOwnerRes = await pool.request()
                    .input('TaskID', sql.Int, TaskID)
                    .query('SELECT TOP(1) CreatedBy FROM Tasks WHERE TaskID = @TaskID');
                const delegatorId = taskOwnerRes.recordset[0]?.CreatedBy || null;
                if (delegatorId) {
                    const active = await hasActiveDelegation(pool, delegatorId, ActedBy);
                    if (active) {
                        actorUserId = ActedBy;
                    }
                }
            } catch (_) {
                actorUserId = null;
            }
        }

        // إدراج التعليق بدون OUTPUT clause لتجنب تعارض مع trigger
        await pool.request()
            .input('TaskID', sql.Int, TaskID)
            .input('UserID', sql.NVarChar, UserID)
            .input('ActedBy', sql.NVarChar, actorUserId)
            .input('Content', sql.NVarChar, encryptionConfig.encrypt(Content))
            .input('CreatedAt', sql.DateTime, commentCreatedAt)
            .input('ShowInCalendar', sql.Bit, ShowInCalendar ? 1 : 0)
            .query(`
                INSERT INTO Comments (TaskID, UserID, ActedBy, Content, CreatedAt, ShowInCalendar)
                VALUES (@TaskID, @UserID, @ActedBy, @Content, @CreatedAt, @ShowInCalendar);
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
        res.status(201).json(newComment);
    } catch (error) {
        console.error("CREATE COMMENT ERROR:", error);
        res.status(500).send({ message: 'Error creating comment' });
    }
};

exports.updateComment = async (req, res) => {
    const pool = req.app.locals.db;
    const { commentId } = req.params;
    const { Content, UserID, ShowInCalendar } = req.body || {};

    if (!commentId || !UserID) {
        return res.status(400).json({ message: 'commentId and UserID are required.' });
    }

    if (typeof Content === 'undefined' && typeof ShowInCalendar === 'undefined') {
        return res.status(400).json({ message: 'Nothing to update. Provide Content and/or ShowInCalendar.' });
    }

    try {
        const existingResult = await pool.request()
            .input('CommentID', sql.Int, commentId)
            .query('SELECT TOP 1 CommentID, UserID, ActedBy FROM Comments WHERE CommentID = @CommentID');

        if (!existingResult.recordset.length) {
            return res.status(404).json({ message: 'Comment not found.' });
        }

        const existing = existingResult.recordset[0];
        const actingUserId = UserID.toString();

        if (existing.UserID !== actingUserId && existing.ActedBy !== actingUserId) {
            return res.status(403).json({ message: 'لا تملك صلاحية تعديل هذا التعليق.' });
        }

        const request = pool.request().input('CommentID', sql.Int, commentId);
        const setClauses = [];

        if (typeof Content !== 'undefined') {
            const encryptedContent = encryptionConfig.encrypt(Content);
            request.input('Content', sql.NVarChar, encryptedContent);
            setClauses.push('Content = @Content');
        }

        if (typeof ShowInCalendar !== 'undefined') {
            request.input('ShowInCalendar', sql.Bit, ShowInCalendar ? 1 : 0);
            setClauses.push('ShowInCalendar = @ShowInCalendar');
        }

        const setSql = setClauses.join(', ');

        await request.query(`UPDATE Comments SET ${setSql} WHERE CommentID = @CommentID`);

        const updatedResult = await pool.request()
            .input('CommentID', sql.Int, commentId)
            .query('SELECT * FROM Comments WHERE CommentID = @CommentID');

        if (!updatedResult.recordset.length) {
            return res.status(404).json({ message: 'Comment not found after update.' });
        }

        const updatedComment = updatedResult.recordset[0];
        if (updatedComment.Content) {
            try { updatedComment.Content = encryptionConfig.decrypt(updatedComment.Content); } catch (e) {}
        }

        res.status(200).json(updatedComment);
    } catch (error) {
        console.error('UPDATE COMMENT ERROR:', error);
        res.status(500).send({ message: 'Error updating comment' });
    }
};

exports.deleteComment = async (req, res) => {
    const pool = req.app.locals.db;
    const { commentId } = req.params;
    const { UserID } = req.body || {};

    if (!commentId || !UserID) {
        return res.status(400).json({ message: 'commentId and UserID are required.' });
    }

    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const existingResult = await new sql.Request(transaction)
            .input('CommentID', sql.Int, commentId)
            .query('SELECT TOP 1 CommentID, UserID, ActedBy FROM Comments WHERE CommentID = @CommentID');

        if (!existingResult.recordset.length) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Comment not found.' });
        }

        const existing = existingResult.recordset[0];
        const actingUserId = UserID.toString();

        if (existing.UserID !== actingUserId && existing.ActedBy !== actingUserId) {
            await transaction.rollback();
            return res.status(403).json({ message: 'لا تملك صلاحية حذف هذا التعليق.' });
        }

        await new sql.Request(transaction)
            .input('CommentID', sql.Int, commentId)
            .query('DELETE FROM CommentNotifications WHERE CommentID = @CommentID');

        await new sql.Request(transaction)
            .input('CommentID', sql.Int, commentId)
            .query('DELETE FROM Comments WHERE CommentID = @CommentID');

        await transaction.commit();

        res.status(200).json({ message: 'Comment deleted successfully' });
    } catch (error) {
        try { await transaction.rollback(); } catch (_) {}
        console.error('DELETE COMMENT ERROR:', error);
        res.status(500).send({ message: 'Error deleting comment' });
    }
};
