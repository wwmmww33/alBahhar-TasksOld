// src/controllers/calendarController.js
const sql = require('mssql');
const encryptionConfig = require('../config/encryption.config');

// يعيد المهام الفرعية المُحددة للعرض في التقويم لقسم المستخدم، مرتبة حسب أقرب تاريخ استحقاق
exports.getDepartmentCalendarSubtasks = async (req, res) => {
  const pool = req.app.locals.db;
  const { userId, limit, startDate, days } = req.query;

  if (!userId) {
    return res.status(400).json({ message: 'userId is required' });
  }

  try {
    // الحصول على قسم المستخدم
    const userRes = await pool.request()
      .input('UserID', sql.NVarChar, userId)
      .query('SELECT DepartmentID FROM Users WHERE UserID = @UserID');

    const userHasDept = !(userRes.recordset.length === 0 || userRes.recordset[0].DepartmentID == null);
    const departmentId = userHasDept ? userRes.recordset[0].DepartmentID : null;
    const safeLimit = Number.isInteger(parseInt(limit)) ? parseInt(limit) : 20;

    // إعداد نطاق التاريخ إذا تم طلبه
    let useRange = false;
    let startDateParam = null;
    let endDateParam = null;
    const daysInt = Number.isInteger(parseInt(days)) ? parseInt(days) : 0;
    if (startDate || daysInt > 0) {
      useRange = true;
      const base = startDate ? new Date(startDate) : new Date();
      // تطبيع إلى تاريخ فقط
      startDateParam = new Date(base.getFullYear(), base.getMonth(), base.getDate());
      const endBase = new Date(startDateParam);
      endBase.setDate(endBase.getDate() + (daysInt > 0 ? daysInt : 30));
      endDateParam = endBase;
    }

    // التحقق من وجود العمود ShowInCalendar قبل الاستعلام
    const colCheck = await pool.request().query(`
      SELECT COL_LENGTH('dbo.Subtasks', 'ShowInCalendar') AS Len
    `);
    if (!colCheck.recordset[0].Len) {
      // إذا لم يكن العمود موجوداً، إرجاع قائمة فارغة مع تنبيه بسيط
      return res.status(200).json([]);
    }

    // بناء استعلام حسب القسم إن وجد، وإلا السقوط الاحتياطي لعناصر المستخدم نفسه
    let items = [];
    if (userHasDept) {
      const request = pool.request().input('DepartmentID', sql.Int, departmentId);
      let query;
      if (useRange) {
        request.input('StartDate', sql.Date, startDateParam)
               .input('EndDate', sql.Date, endDateParam);
        query = `
          SELECT
            s.SubtaskID,
            s.TaskID,
            s.Title as SubtaskTitle,
            s.DueDate,
            t.Title as TaskTitle,
            t.DepartmentID,
            s.AssignedTo,
            u.FullName as AssignedToName
          FROM Subtasks s
          INNER JOIN Tasks t ON s.TaskID = t.TaskID
          LEFT JOIN Users u ON s.AssignedTo = u.UserID
          WHERE s.ShowInCalendar = 1
            AND s.IsCompleted = 0
            AND s.DueDate IS NOT NULL
            AND CAST(s.DueDate AS DATE) >= @StartDate
            AND CAST(s.DueDate AS DATE) < @EndDate
            AND t.DepartmentID = @DepartmentID
          ORDER BY s.DueDate ASC
        `;
      } else {
        query = `
          SELECT TOP(${safeLimit})
            s.SubtaskID,
            s.TaskID,
            s.Title as SubtaskTitle,
            s.DueDate,
            t.Title as TaskTitle,
            t.DepartmentID,
            s.AssignedTo,
            u.FullName as AssignedToName
          FROM Subtasks s
          INNER JOIN Tasks t ON s.TaskID = t.TaskID
          LEFT JOIN Users u ON s.AssignedTo = u.UserID
          WHERE s.ShowInCalendar = 1
            AND s.IsCompleted = 0
            AND s.DueDate IS NOT NULL
            AND CAST(s.DueDate AS DATE) >= CAST(GETDATE() AS DATE)
            AND t.DepartmentID = @DepartmentID
          ORDER BY s.DueDate ASC
        `;
      }

      const result = await request.query(query);
      items = result.recordset;

      // إذا لم نجد عناصر للقسم، نسقط تلقائياً لعناصر المستخدم نفسه
      if (!items || items.length === 0) {
        const fallbackReq = pool.request().input('UserID', sql.NVarChar, userId);
        if (useRange) {
          fallbackReq.input('StartDate', sql.Date, startDateParam)
                     .input('EndDate', sql.Date, endDateParam);
        }
        const fallbackQuery = useRange ? `
          SELECT
            s.SubtaskID,
            s.TaskID,
            s.Title as SubtaskTitle,
            s.DueDate,
            t.Title as TaskTitle,
            t.DepartmentID,
            s.AssignedTo,
            u.FullName as AssignedToName
          FROM Subtasks s
          INNER JOIN Tasks t ON s.TaskID = t.TaskID
          LEFT JOIN Users u ON s.AssignedTo = u.UserID
          WHERE s.ShowInCalendar = 1
            AND s.IsCompleted = 0
            AND s.DueDate IS NOT NULL
            AND CAST(s.DueDate AS DATE) >= @StartDate
            AND CAST(s.DueDate AS DATE) < @EndDate
            AND s.AssignedTo = @UserID
          ORDER BY s.DueDate ASC
        ` : `
          SELECT TOP(${safeLimit})
            s.SubtaskID,
            s.TaskID,
            s.Title as SubtaskTitle,
            s.DueDate,
            t.Title as TaskTitle,
            t.DepartmentID,
            s.AssignedTo,
            u.FullName as AssignedToName
          FROM Subtasks s
          INNER JOIN Tasks t ON s.TaskID = t.TaskID
          LEFT JOIN Users u ON s.AssignedTo = u.UserID
          WHERE s.ShowInCalendar = 1
            AND s.IsCompleted = 0
            AND s.DueDate IS NOT NULL
            AND CAST(s.DueDate AS DATE) >= CAST(GETDATE() AS DATE)
            AND s.AssignedTo = @UserID
          ORDER BY s.DueDate ASC
        `;
        const fbResult = await fallbackReq.query(fallbackQuery);
        items = fbResult.recordset;
      }
    } else {
      // لا يوجد قسم للمستخدم، نرجع عناصر المستخدم نفسه مباشرةً
      const request = pool.request().input('UserID', sql.NVarChar, userId);
      if (useRange) {
        request.input('StartDate', sql.Date, startDateParam)
               .input('EndDate', sql.Date, endDateParam);
      }
      const query = useRange ? `
        SELECT
          s.SubtaskID,
          s.TaskID,
          s.Title as SubtaskTitle,
          s.DueDate,
          t.Title as TaskTitle,
          t.DepartmentID,
          s.AssignedTo,
          u.FullName as AssignedToName
        FROM Subtasks s
        INNER JOIN Tasks t ON s.TaskID = t.TaskID
        LEFT JOIN Users u ON s.AssignedTo = u.UserID
        WHERE s.ShowInCalendar = 1
          AND s.IsCompleted = 0
          AND s.DueDate IS NOT NULL
          AND CAST(s.DueDate AS DATE) >= @StartDate
          AND CAST(s.DueDate AS DATE) < @EndDate
          AND s.AssignedTo = @UserID
        ORDER BY s.DueDate ASC
      ` : `
        SELECT TOP(${safeLimit})
          s.SubtaskID,
          s.TaskID,
          s.Title as SubtaskTitle,
          s.DueDate,
          t.Title as TaskTitle,
          t.DepartmentID,
          s.AssignedTo,
          u.FullName as AssignedToName
        FROM Subtasks s
        INNER JOIN Tasks t ON s.TaskID = t.TaskID
        LEFT JOIN Users u ON s.AssignedTo = u.UserID
        WHERE s.ShowInCalendar = 1
          AND s.IsCompleted = 0
          AND s.DueDate IS NOT NULL
          AND CAST(s.DueDate AS DATE) >= CAST(GETDATE() AS DATE)
          AND s.AssignedTo = @UserID
        ORDER BY s.DueDate ASC
      `;
      const result = await request.query(query);
      items = result.recordset;
    }
    const decrypted = items.map(r => {
      try { if (r.SubtaskTitle) r.SubtaskTitle = encryptionConfig.decrypt(r.SubtaskTitle); } catch (_) {}
      try { if (r.TaskTitle) r.TaskTitle = encryptionConfig.decrypt(r.TaskTitle); } catch (_) {}
      return r;
    });

    res.status(200).json(decrypted);
  } catch (error) {
    console.error('Error fetching calendar subtasks:', error);
    res.status(500).json({ message: 'Error fetching calendar subtasks' });
  }
};

// جلب الأحداث الخاصة للمستخدم نفسه فقط ضمن نطاق تاريخ محدد
exports.getPersonalEvents = async (req, res) => {
  const pool = req.app.locals.db;
  const { userId, startDate, days } = req.query;
  if (!userId) {
    return res.status(400).json({ message: 'userId is required' });
  }
  try {
    // إعداد نطاق التاريخ
    let useRange = false;
    let startDateParam = null;
    let endDateParam = null;
    const daysInt = Number.isInteger(parseInt(days)) ? parseInt(days) : 0;
    if (startDate || daysInt > 0) {
      useRange = true;
      const base = startDate ? new Date(startDate) : new Date();
      startDateParam = new Date(base.getFullYear(), base.getMonth(), base.getDate());
      const endBase = new Date(startDateParam);
      endBase.setDate(endBase.getDate() + (daysInt > 0 ? daysInt : 30));
      endDateParam = endBase;
    }

    // التحقق من وجود الجدول
    const tableCheck = await pool.request().query(`
      SELECT COUNT(*) as tableExists 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'PersonalCalendarEvents'
    `);
    if (tableCheck.recordset[0].tableExists === 0) {
      return res.status(200).json([]);
    }

    const request = pool.request().input('UserID', sql.NVarChar, userId);
    let query;
    if (useRange) {
      request.input('StartDate', sql.Date, startDateParam)
             .input('EndDate', sql.Date, endDateParam);
      query = `
        SELECT EventID, UserID, Title, EventDate, CreatedAt
        FROM PersonalCalendarEvents
        WHERE UserID = @UserID
          AND EventDate >= @StartDate
          AND EventDate < @EndDate
        ORDER BY EventDate ASC, EventID ASC
      `;
    } else {
      query = `
        SELECT EventID, UserID, Title, EventDate, CreatedAt
        FROM PersonalCalendarEvents
        WHERE UserID = @UserID
          AND EventDate >= CAST(GETDATE() AS DATE)
        ORDER BY EventDate ASC, EventID ASC
      `;
    }
    const result = await request.query(query);
    const decrypted = result.recordset.map(r => {
      try { if (r.Title) r.Title = encryptionConfig.decrypt(r.Title); } catch (_) {}
      return r;
    });
    return res.status(200).json(decrypted);
  } catch (err) {
    console.error('Error fetching personal events:', err);
    return res.status(500).json({ message: 'Error fetching personal events' });
  }
};

// إنشاء حدث خاص جديد للمستخدم
exports.createPersonalEvent = async (req, res) => {
  const pool = req.app.locals.db;
  const { userId, title, eventDate } = req.body;
  if (!userId || !title || !eventDate) {
    return res.status(400).json({ message: 'userId, title, and eventDate are required' });
  }
  try {
    // تطبيع التاريخ إلى تاريخ فقط
    const d = new Date(eventDate);
    const normalized = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const encTitle = encryptionConfig.encrypt(title);

    // التحقق من وجود الجدول
    const tableCheck = await pool.request().query(`
      SELECT COUNT(*) as tableExists 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'PersonalCalendarEvents'
    `);
    if (tableCheck.recordset[0].tableExists === 0) {
      return res.status(500).json({ message: 'PersonalCalendarEvents table not found. Migration not applied.' });
    }

    const result = await pool.request()
      .input('UserID', sql.NVarChar, userId)
      .input('Title', sql.NVarChar, encTitle)
      .input('EventDate', sql.Date, normalized)
      .query(`
        INSERT INTO PersonalCalendarEvents (UserID, Title, EventDate, CreatedAt)
        OUTPUT INSERTED.EventID, INSERTED.UserID, INSERTED.Title, INSERTED.EventDate, INSERTED.CreatedAt
        VALUES (@UserID, @Title, @EventDate, GETDATE());
      `);
    const created = result.recordset[0];
    try { if (created && created.Title) created.Title = encryptionConfig.decrypt(created.Title); } catch (_) {}
    return res.status(201).json(created);
  } catch (err) {
    console.error('Error creating personal event:', err);
    return res.status(500).json({ message: 'Error creating personal event' });
  }
};