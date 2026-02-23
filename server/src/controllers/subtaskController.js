// src/controllers/subtaskController.js
const sql = require('mssql');
const encryptionConfig = require('../config/encryption.config');

exports.getAllSubtasks = async (req, res) => {
  const pool = req.app.locals.db;
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ message: 'User identification is required' });
  }

  try {
    const result = await pool.request()
      .input('UserId', sql.NVarChar, userId)
      .query(`
        SELECT 
          s.SubtaskID,
          s.TaskID,
          s.Title,
          s.CreatedBy,
          s.AssignedTo,
          s.IsCompleted,
          s.DueDate,
          s.ShowInCalendar,
          s.CreatedAt,
          t.Priority
        FROM Subtasks s
        INNER JOIN Tasks t ON s.TaskID = t.TaskID
        WHERE s.AssignedTo = @UserId
        ORDER BY s.CreatedAt DESC
      `);

    const subtasks = result.recordset.map(s => {
      if (s.Title) {
        try { s.Title = encryptionConfig.decrypt(s.Title); } catch (_) {}
      }
      return s;
    });

    res.json(subtasks);
  } catch (error) {
    console.error('Error fetching subtasks:', error);
    res.status(500).json({ message: 'Error fetching subtasks' });
  }
};

exports.createSubtask = async (req, res) => {
  const pool = req.app.locals.db;
  // --- تأكد من أننا نستقبل كل هذه الحقول ---
  const { TaskID, Title, CreatedBy, ActedBy, DueDate, AssignedTo, ShowInCalendar } = req.body;
  
  if (!TaskID || !Title || !CreatedBy) {
    return res.status(400).json({ message: 'TaskID, Title, and CreatedBy are required.' });
  }

  const finalAssignedTo = AssignedTo || CreatedBy;
  let actorUserId = null;
  if (ActedBy && ActedBy !== CreatedBy) {
    try {
      const { hasActiveDelegation } = require('../utils/delegationUtils');
      const active = await hasActiveDelegation(pool, CreatedBy, ActedBy);
      if (active) {
        actorUserId = ActedBy;
      }
    } catch (_) {
      actorUserId = null;
    }
  }
  const encryptedTitle = encryptionConfig.encrypt(Title);

  try {
    // تطبيع DueDate إلى تاريخ محلي فقط لتجنب انحراف المنطقة الزمنية
    let dueDateNormalized = null;
    if (DueDate) {
      const d = new Date(DueDate);
      dueDateNormalized = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const result = await pool.request()
      .input('TaskID', sql.Int, TaskID)
      .input('Title', sql.NVarChar, encryptedTitle)
      .input('CreatedBy', sql.NVarChar, CreatedBy)
      .input('ActedBy', sql.NVarChar, actorUserId)
      .input('AssignedTo', sql.NVarChar, finalAssignedTo)
      .input('DueDate', sql.Date, dueDateNormalized)
      .input('ShowInCalendar', sql.Bit, ShowInCalendar === true ? 1 : 0)
      .query(`
        INSERT INTO Subtasks (TaskID, Title, CreatedBy, ActedBy, AssignedTo, IsCompleted, DueDate, CreatedAt, ShowInCalendar)
        OUTPUT INSERTED.*
        VALUES (@TaskID, @Title, @CreatedBy, @ActedBy, @AssignedTo, 0, @DueDate, GETDATE(), @ShowInCalendar);
      `);

    const newSubtask = result.recordset[0];

    if (finalAssignedTo && finalAssignedTo !== CreatedBy) {
      await pool.request()
        .input('TaskID', sql.Int, TaskID)
        .input('AssignedToUserID', sql.NVarChar, finalAssignedTo)
        .input('AssignedByUserID', sql.NVarChar, CreatedBy)
        .query(`
          INSERT INTO TaskAssignmentNotifications 
          (TaskID, AssignedToUserID, AssignedByUserID)
          SELECT @TaskID, @AssignedToUserID, @AssignedByUserID
          WHERE EXISTS (SELECT 1 FROM Users WHERE UserID = @AssignedByUserID)
        `);
    }

    // فك تشفير العنوان قبل الإرجاع
    if (newSubtask && newSubtask.Title) {
      try { newSubtask.Title = encryptionConfig.decrypt(newSubtask.Title); } catch (_) {}
    }

    res.status(201).json(newSubtask);
  } catch (error) {
    console.error("DATABASE CREATE SUBTASK ERROR:", error);
    res.status(500).send({ message: 'Error creating subtask' });
  }
};

exports.updateSubtaskStatus = async (req, res) => {
  const pool = req.app.locals.db;
  const { subtaskId } = req.params;
  const { isCompleted } = req.body;

  if (typeof isCompleted !== 'boolean') {
    return res.status(400).json({ message: 'isCompleted field must be a boolean.' });
  }

  try {
    await pool.request()
      .input('SubtaskID', sql.Int, subtaskId)
      .input('IsCompleted', sql.Bit, isCompleted)
      .query('UPDATE Subtasks SET IsCompleted = @IsCompleted WHERE SubtaskID = @SubtaskID');
    res.status(200).json({ message: 'Subtask status updated successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Error updating subtask status' });
  }
};

exports.assignSubtask = async (req, res) => {
  const pool = req.app.locals.db;
  const { subtaskId } = req.params;
  const { assignedToUserId, assignedByUserId } = req.body;

  if (assignedToUserId === undefined) {
    return res.status(400).json({ message: 'assignedToUserId field is required.' });
  }

  try {
    // الحصول على معلومات المهمة الفرعية والمهمة الرئيسية
    const subtaskResult = await pool.request()
      .input('SubtaskID', sql.Int, subtaskId)
      .query('SELECT TaskID, AssignedTo FROM Subtasks WHERE SubtaskID = @SubtaskID');
    
    if (subtaskResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Subtask not found' });
    }

    const subtask = subtaskResult.recordset[0];
    const previousAssignedTo = subtask.AssignedTo;

    // تحديث إسناد المهمة الفرعية
    await pool.request()
      .input('SubtaskID', sql.Int, subtaskId)
      .input('AssignedTo', sql.NVarChar, assignedToUserId || null)
      .query('UPDATE Subtasks SET AssignedTo = @AssignedTo WHERE SubtaskID = @SubtaskID');

    if (assignedToUserId && assignedToUserId !== previousAssignedTo && assignedByUserId) {
      await pool.request()
        .input('TaskID', sql.Int, subtask.TaskID)
        .input('AssignedToUserID', sql.NVarChar, assignedToUserId)
        .input('AssignedByUserID', sql.NVarChar, assignedByUserId)
        .query(`
          INSERT INTO TaskAssignmentNotifications 
          (TaskID, AssignedToUserID, AssignedByUserID)
          SELECT @TaskID, @AssignedToUserID, @AssignedByUserID
          WHERE EXISTS (SELECT 1 FROM Users WHERE UserID = @AssignedByUserID)
        `);
    }

    res.status(200).json({ message: 'Subtask assigned successfully' });
  } catch (error) {
    console.error('Error assigning subtask:', error);
    res.status(500).send({ message: 'Error assigning subtask' });
  }
};

exports.deleteSubtask = async (req, res) => {
    const pool = req.app.locals.db;
    const { subtaskId } = req.params;
    try {
        await pool.request()
            .input('SubtaskID', sql.Int, subtaskId)
            .query('DELETE FROM Subtasks WHERE SubtaskID = @SubtaskID');
        res.status(200).json({ message: 'Subtask deleted successfully' });
    } catch (error) {
        res.status(500).send({ message: 'Error deleting subtask' });
    }
};

// تحديث نص المهمة الفرعية وتاريخ الاستحقاق
exports.updateSubtaskDetails = async (req, res) => {
  const pool = req.app.locals.db;
  const { subtaskId } = req.params;
  const { Title, DueDate } = req.body;

  if (typeof Title === 'undefined' && typeof DueDate === 'undefined') {
    return res.status(400).json({ message: 'Provide Title and/or DueDate to update.' });
  }

  try {
    // تجهيز القيم
    const hasTitle = typeof Title !== 'undefined';
    const hasDue = typeof DueDate !== 'undefined';
    const encryptedTitle = hasTitle ? encryptionConfig.encrypt(Title) : null;
    let dueDateNormalized = null;
    if (hasDue) {
      if (DueDate) {
        const d = new Date(DueDate);
        dueDateNormalized = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      } else {
        // إذا أُرسلت قيمة فارغة، نجعلها NULL لإزالة تاريخ الاستحقاق
        dueDateNormalized = null;
      }
    }

    await pool.request()
      .input('SubtaskID', sql.Int, subtaskId)
      .input('HasTitle', sql.Bit, hasTitle ? 1 : 0)
      .input('Title', sql.NVarChar, encryptedTitle)
      .input('HasDue', sql.Bit, hasDue ? 1 : 0)
      .input('DueDate', sql.Date, dueDateNormalized)
      .query(`
        UPDATE Subtasks
        SET
          Title = CASE WHEN @HasTitle = 1 THEN @Title ELSE Title END,
          DueDate = CASE WHEN @HasDue = 1 THEN @DueDate ELSE DueDate END
        WHERE SubtaskID = @SubtaskID
      `);

    const result = await pool.request()
      .input('SubtaskID', sql.Int, subtaskId)
      .query('SELECT TOP(1) * FROM Subtasks WHERE SubtaskID = @SubtaskID');
    const updated = result.recordset[0];
    if (!updated) {
      return res.status(404).json({ message: 'Subtask not found' });
    }
    if (updated.Title) {
      try { updated.Title = encryptionConfig.decrypt(updated.Title); } catch (_) {}
    }
    return res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating subtask details:', error);
    return res.status(500).json({ message: 'Error updating subtask details' });
  }
};

// تحديث علم إظهار المهمة الفرعية في التقويم
exports.updateSubtaskCalendarFlag = async (req, res) => {
  const pool = req.app.locals.db;
  const { subtaskId } = req.params;
  const { ShowInCalendar } = req.body;

  if (!subtaskId) {
    return res.status(400).json({ message: 'subtaskId is required.' });
  }
  if (typeof ShowInCalendar === 'undefined') {
    return res.status(400).json({ message: 'ShowInCalendar field is required.' });
  }

  try {
    // التأكد من وجود المهمة الفرعية
    const check = await pool.request()
      .input('SubtaskID', sql.Int, subtaskId)
      .query('SELECT TOP(1) * FROM Subtasks WHERE SubtaskID = @SubtaskID');

    if (check.recordset.length === 0) {
      return res.status(404).json({ message: 'Subtask not found.' });
    }

    // تحديث العلم
    await pool.request()
      .input('SubtaskID', sql.Int, subtaskId)
      .input('ShowInCalendar', sql.Bit, ShowInCalendar ? 1 : 0)
      .query('UPDATE Subtasks SET ShowInCalendar = @ShowInCalendar WHERE SubtaskID = @SubtaskID');

    // إعادة إرجاع السجل المحدث
    const result = await pool.request()
      .input('SubtaskID', sql.Int, subtaskId)
      .query('SELECT TOP(1) * FROM Subtasks WHERE SubtaskID = @SubtaskID');

    const updated = result.recordset[0];
    if (updated && updated.Title) {
      try { updated.Title = encryptionConfig.decrypt(updated.Title); } catch (_) {}
    }
    return res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating subtask calendar flag:', error);
    return res.status(500).json({ message: 'Error updating subtask calendar flag.' });
  }
};
