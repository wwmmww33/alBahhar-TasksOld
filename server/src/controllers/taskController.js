// src/controllers/taskController.js
const sql = require('mssql');
const { getTasksQueryWithDelegation, checkTaskAccess, checkDelegationPermission, hasActiveDelegation } = require('../utils/delegationUtils');
const encryptionConfig = require('../config/encryption.config');

// التراجع عن دفعة نقل (إرجاع الإسناد السابق) - REMOVED
// exports.revertTaskTransferBatch was here

// جلب سجل دفعات النقل للمستخدم (المرسل) - REMOVED
// exports.getUserTransferBatches was here

exports.getAllTasks = async (req, res) => {
    const pool = req.app.locals.db;
    const { userId, isAdmin } = req.query;
    if (!userId) { return res.status(401).json({ message: 'User identification is required.' }); }

    try {
        const query = await getTasksQueryWithDelegation(pool, userId, isAdmin === 'true');
        const request = pool.request();
        const result = await request.query(query);
        const tasks = result.recordset.map(t => {
            if (t.Description) {
                try { t.Description = encryptionConfig.decrypt(t.Description); } catch (e) {}
            }
            if (t.Title) {
                try { t.Title = encryptionConfig.decrypt(t.Title); } catch (e) {}
            }
            return t;
        });
        res.status(200).json(tasks);

    } catch (error) {
        console.error('DATABASE GET ALL TASKS ERROR:', error);
        res.status(500).send({ message: 'Error fetching tasks' });
    }
};

// الحصول على إشعارات الإسناد للمستخدم
exports.getAssignmentNotifications = async (req, res) => {
    const pool = req.app.locals.db;
    const { userId } = req.query;
    
    if (!userId) {
        return res.status(400).json({ message: 'userId is required' });
    }
    
    try {
        const result = await pool.request()
            .input('UserID', sql.NVarChar, userId)
            .query(`
                SELECT 
                    tan.*,
                    t.Title as TaskTitle,
                    assignedBy.FullName as AssignedByName
                FROM TaskAssignmentNotifications tan
                LEFT JOIN Tasks t ON tan.TaskID = t.TaskID
                LEFT JOIN Users assignedBy ON tan.AssignedByUserID = assignedBy.UserID
                WHERE tan.AssignedToUserID = @UserID
                AND tan.IsRead = 0
                ORDER BY tan.CreatedAt DESC
            `);
        const notifications = result.recordset.map(n => {
            if (n.TaskTitle) {
                try { n.TaskTitle = encryptionConfig.decrypt(n.TaskTitle); } catch (e) {}
            }
            return n;
        });
        res.status(200).json(notifications);
    } catch (error) {
        console.error('GET ASSIGNMENT NOTIFICATIONS ERROR:', error);
        res.status(500).send({ message: 'Error fetching assignment notifications' });
    }
};

// تحديد إشعار الإسناد كمقروء
exports.markAssignmentNotificationAsRead = async (req, res) => {
    const pool = req.app.locals.db;
    const { notificationId } = req.params;
    
    try {
        await pool.request()
            .input('NotificationID', sql.Int, notificationId)
            .query(`
                UPDATE TaskAssignmentNotifications 
                SET IsRead = 1, ReadAt = GETDATE() 
                WHERE NotificationID = @NotificationID
            `);
        res.status(200).json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('MARK NOTIFICATION AS READ ERROR:', error);
        res.status(500).send({ message: 'Error marking notification as read' });
    }
};

// إسناد المهمة الرئيسية
exports.assignTask = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    const { assignedToUserId, assignedByUserId } = req.body;

    if (assignedToUserId === undefined) {
        return res.status(400).json({ message: 'assignedToUserId field is required.' });
    }

    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const taskResult = await new sql.Request(transaction)
            .input('TaskID', sql.Int, id)
            .query('SELECT AssignedTo FROM Tasks WHERE TaskID = @TaskID');
        
        if (taskResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ message: 'Task not found' });
        }

        const task = taskResult.recordset[0];
        const previousAssignedTo = task.AssignedTo;

        // 1. تحديث المهمة
        await new sql.Request(transaction)
            .input('TaskID', sql.Int, id)
            .input('AssignedTo', sql.NVarChar, assignedToUserId || null)
            .query('UPDATE Tasks SET AssignedTo = @AssignedTo WHERE TaskID = @TaskID');

        // 2. تسجيل النقل في سجل الدفعات (TaskTransferBatches)
        // نعتبر هذا "دفعة نقل" حتى لو كان عنصراً واحداً
        if (assignedByUserId && (previousAssignedTo !== assignedToUserId)) {
             const batchResult = await new sql.Request(transaction)
                .input('FromUserID', sql.NVarChar, previousAssignedTo || null) // قد يكون null إذا لم تكن مسندة
                .input('ToUserID', sql.NVarChar, assignedToUserId || null)
                .input('CreatedBy', sql.NVarChar, assignedByUserId)
                .query(`
                    INSERT INTO TaskTransferBatches (FromUserID, ToUserID, CreatedBy)
                    OUTPUT INSERTED.BatchID
                    VALUES (@FromUserID, @ToUserID, @CreatedBy)
                `);
            
            const batchId = batchResult.recordset[0].BatchID;

            // 3. تسجيل تفاصيل العنصر المنقول (TaskTransferItems)
            await new sql.Request(transaction)
                .input('BatchID', sql.Int, batchId)
                .input('TableName', sql.NVarChar, 'Tasks')
                .input('RecordID', sql.Int, id)
                .input('ColumnName', sql.NVarChar, 'AssignedTo')
                .input('OldValue', sql.NVarChar, previousAssignedTo ? String(previousAssignedTo) : null)
                .query(`
                    INSERT INTO TaskTransferItems (BatchID, TableName, RecordID, ColumnName, OldValue)
                    VALUES (@BatchID, @TableName, @RecordID, @ColumnName, @OldValue)
                `);
        }

        // 4. إشعار الإسناد (كما كان سابقاً)
        if (assignedToUserId && assignedToUserId !== previousAssignedTo && assignedByUserId) {
            await new sql.Request(transaction)
                .input('TaskID', sql.Int, id)
                .input('AssignedToUserID', sql.NVarChar, assignedToUserId)
                .input('AssignedByUserID', sql.NVarChar, assignedByUserId)
                .query(`
                    INSERT INTO TaskAssignmentNotifications 
                    (TaskID, AssignedToUserID, AssignedByUserID)
                    SELECT @TaskID, @AssignedToUserID, @AssignedByUserID
                    WHERE EXISTS (SELECT 1 FROM Users WHERE UserID = @AssignedByUserID)
                `);
        }

        await transaction.commit();
        res.status(200).json({ message: 'Task assigned successfully' });
    } catch (error) {
        if (transaction._aborted === false) {
             await transaction.rollback();
        }
        console.error('Error assigning task:', error);
        res.status(500).send({ message: 'Error assigning task' });
    }
};

exports.createTask = async (req, res) => {
  // --- createTask المصحح (بدون AssignedTo) ---
  const { Title, Description, DepartmentID, Priority, DueDate, subtasks, CreatedBy, ActedBy, CategoryID } = req.body;
  // تشفير الوصف إن وُجد
  const encryptedDescription = Description ? encryptionConfig.encrypt(Description) : null;
  const encryptedTitle = encryptionConfig.encrypt(Title);
  if (!Title || !DepartmentID || !DueDate || !CreatedBy) {
    return res.status(400).json({ message: 'Title, DepartmentID, DueDate, and CreatedBy are required.' });
  }
  const pool = req.app.locals.db;
  const transaction = new sql.Transaction(pool);
  try {
    await transaction.begin();
    let actorUserId = null;
    if (ActedBy && ActedBy !== CreatedBy) {
      try {
        const active = await hasActiveDelegation(pool, CreatedBy, ActedBy);
        if (active) {
          actorUserId = ActedBy;
        }
      } catch (_) {
        actorUserId = null;
      }
    }
    const taskResult = await new sql.Request(transaction)
      .input('Title', sql.NVarChar, encryptedTitle).input('Description', sql.NVarChar, encryptedDescription)
      .input('CreatedBy', sql.NVarChar, CreatedBy).input('ActedBy', sql.NVarChar, actorUserId)
      .input('DepartmentID', sql.Int, DepartmentID)
      .input('Priority', sql.NVarChar, Priority || 'normal').input('DueDate', sql.DateTime, new Date(DueDate))
      .input('CategoryID', sql.Int, CategoryID || null)
      .query(`INSERT INTO Tasks (Title, Description, CreatedBy, ActedBy, DepartmentID, Priority, DueDate, Status, CategoryID) OUTPUT INSERTED.TaskID VALUES (@Title, @Description, @CreatedBy, @ActedBy, @DepartmentID, @Priority, @DueDate, 'open', @CategoryID);`);
    const newTaskId = taskResult.recordset[0].TaskID;
    if (subtasks && subtasks.length > 0) {
      for (const subtaskTitle of subtasks) {
        const encSubtaskTitle = encryptionConfig.encrypt(subtaskTitle);
        await new sql.Request(transaction)
          .input('TaskID', sql.Int, newTaskId).input('Title', sql.NVarChar, encSubtaskTitle)
          .input('CreatedBy', sql.NVarChar, CreatedBy)
          .input('ActedBy', sql.NVarChar, actorUserId)
          .input('AssignedTo', sql.NVarChar, CreatedBy)
          .query('INSERT INTO Subtasks (TaskID, Title, CreatedBy, ActedBy, AssignedTo, IsCompleted, CreatedAt) VALUES (@TaskID, @Title, @CreatedBy, @ActedBy, @AssignedTo, 0, GETDATE())');
      }
    }
    await transaction.commit();
    res.status(201).json({ message: 'Task and subtasks created successfully!', newTaskId: newTaskId });
  } catch (error) {
    await transaction.rollback();
    res.status(500).send({ message: 'Error creating task' });
  }
};

exports.getTaskById = async (req, res) => {
  const pool = req.app.locals.db;
  const { userId, isAdmin } = req.query;
  
  // التحقق من وجود معرف المستخدم
  if (!userId) {
    return res.status(401).json({ message: 'User identification is required.' });
  }
  
  try {
    const { id } = req.params;
    
    const accessCheck = await checkTaskAccess(pool, id, userId, isAdmin === 'true', 'view');
    
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ message: accessCheck.reason });
    }
    
    // الحصول على تفاصيل المهمة مع معلومات إضافية
    const result = await pool.request().input('TaskID', sql.Int, id).query(`
      SELECT t.*, creator.FullName as CreatedByName, acted.FullName as ActedByName, c.Name as CategoryName
      FROM Tasks t
      LEFT JOIN Users creator ON t.CreatedBy = creator.UserID
      LEFT JOIN Users acted ON t.ActedBy = acted.UserID
      LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
      WHERE t.TaskID = @TaskID
    `);
    
    if (result.recordset.length === 0) { 
      return res.status(404).json({ message: 'Task not found' }); 
    }
    
    // إضافة معلومات نوصول للاستجابة
    const taskData = {
      ...result.recordset[0],
      accessType: accessCheck.accessType
    };
    // فك التشفير لوصف وعنوان المهمة إن وُجد
    if (taskData.Description) {
      try { taskData.Description = encryptionConfig.decrypt(taskData.Description); } catch (e) {}
    }
    if (taskData.Title) {
      try { taskData.Title = encryptionConfig.decrypt(taskData.Title); } catch (e) {}
    }
    res.status(200).json(taskData);
  } catch (error) { 
    console.error('Error fetching task details:', error);
    res.status(500).send({ message: 'Error fetching task details' }); 
  }
};

exports.getSubtasksForTask = async (req, res) => {
  const pool = req.app.locals.db;
  const { id } = req.params;
  const { userId, isAdmin } = req.query;
  
  // التحقق من وجود معرف المستخدم
  if (!userId) {
    return res.status(401).json({ message: 'User identification is required.' });
  }
  
  try {
    const accessCheck = await checkTaskAccess(pool, id, userId, isAdmin === 'true', 'view');
    
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ message: accessCheck.reason });
    }
    
    // الحصول على المهام الفرعية
    let query = `
      SELECT s.*, 
             u.FullName as AssignedToName,
             creator.FullName as CreatedByName
      FROM Subtasks s 
      LEFT JOIN Users u ON s.AssignedTo = u.UserID 
      LEFT JOIN Users creator ON s.CreatedBy = creator.UserID
      WHERE s.TaskID = @TaskID 
      ORDER BY s.CreatedAt DESC
    `;
    const request = pool.request().input('TaskID', sql.Int, id);
    const result = await request.query(query);
    const subtasks = result.recordset.map(s => {
      if (s.Title) {
        try { s.Title = encryptionConfig.decrypt(s.Title); } catch (_) {}
      }
      return s;
    });
    res.status(200).json(subtasks);
  } catch (error) { 
    console.error('Error fetching subtasks:', error);
    res.status(500).send({ message: 'Error fetching subtasks' }); 
  }
};

exports.getCommentsForTask = async (req, res) => {
  const pool = req.app.locals.db;
  const { id } = req.params;
  const { userId, isAdmin } = req.query;
  
  // التحقق من وجود معرف المستخدم
  if (!userId) {
    return res.status(401).json({ message: 'User identification is required.' });
  }
  
  try {
    const accessCheck = await checkTaskAccess(pool, id, userId, isAdmin === 'true', 'view');
    
    if (!accessCheck.hasAccess) {
      return res.status(403).json({ message: accessCheck.reason });
    }
    
    // الحصول على التعليقات
    const result = await pool.request().input('TaskID', sql.Int, id).query(`
      SELECT c.*, u.FullName as UserName 
      FROM Comments c 
      LEFT JOIN Users u ON c.UserID = u.UserID 
      WHERE c.TaskID = @TaskID 
      ORDER BY c.CreatedAt DESC
    `);
    const comments = result.recordset.map(c => {
      if (c.Content) {
        try { c.Content = encryptionConfig.decrypt(c.Content); } catch (e) {}
      }
      return c;
    });
    res.status(200).json(comments);
  } catch (error) { 
    console.error('Error fetching comments:', error);
    res.status(500).send({ message: 'Error fetching comments' }); 
  }
};

exports.getUsersByDepartment = async (req, res) => {
  const pool = req.app.locals.db;
  try {
    const { departmentId } = req.params;
    const result = await pool.request().input('DepartmentID', sql.Int, departmentId).query('SELECT UserID, FullName FROM Users WHERE DepartmentID = @DepartmentID');
    res.status(200).json(result.recordset);
  } catch (error) { res.status(500).send({ message: 'Error fetching department users' }); }
};

exports.updateTaskStatus = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    let { Status } = req.body;
    
    // التحقق من صحة الحالة
    const validStatuses = ['open', 'in-progress', 'completed', 'cancelled', 'external', 'approved-in-progress'];
    if (!Status || !validStatuses.includes(Status)) {
        return res.status(400).json({ message: 'Valid status is required (open, in-progress, completed, cancelled, external, approved-in-progress)' });
    }
    
    // تحويل القيم غير المدعومة في قاعدة البيانات إلى قيم مدعومة مؤقتاً
    const statusMapping = {
        'external': 'in-progress',
        'approved-in-progress': 'in-progress'
    };
    
    const dbStatus = statusMapping[Status] || Status;
    
    try {
        // تحديث الحالة بدون تحويل مؤقت - سنحفظ الحالة الأصلية
        await pool.request()
            .input('TaskID', sql.Int, id)
            .input('Status', sql.NVarChar, Status)
            .query('UPDATE Tasks SET Status = @Status WHERE TaskID = @TaskID');
        
        res.status(200).json({ message: 'Task status updated successfully' });
    } catch (error) { 
        console.error('UPDATE TASK STATUS ERROR:', error);
        res.status(500).send({ message: 'Error updating task status' }); 
    }
};

// الدالة القديمة للأولوية العامة (سيتم الاحتفاظ بها للتوافق مع النسخة السابقة)
exports.updateTaskPriority = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    const { priority } = req.body;
    
    if (!priority || !['normal', 'urgent'].includes(priority)) {
        return res.status(400).json({ message: 'Valid priority is required (normal, urgent)' });
    }
    
    try {
        await pool.request()
            .input('TaskID', sql.Int, id)
            .input('Priority', sql.NVarChar, priority)
            .query('UPDATE Tasks SET Priority = @Priority WHERE TaskID = @TaskID');
        res.status(200).json({ message: 'Task priority updated successfully' });
    } catch (error) {
        console.error('UPDATE TASK PRIORITY ERROR:', error);
        res.status(500).send({ message: 'Error updating task priority' });
    }
};

// دالة جديدة للأولوية الشخصية
exports.updateUserTaskPriority = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    const { priority } = req.body;
    const { userId } = req.query;
    
    console.log('UPDATE USER TASK PRIORITY - UserID:', userId, 'TaskID:', id, 'Priority:', priority);
    
    if (!userId) {
        console.log('ERROR: No user ID provided');
        return res.status(400).json({ message: 'User ID is required' });
    }
    
    if (!priority || !['normal', 'urgent', 'starred'].includes(priority)) {
        console.log('ERROR: Invalid priority:', priority);
        return res.status(400).json({ message: 'Valid priority is required (normal, urgent, starred)' });
    }
    
    try {
        // التحقق من وجود المهمة
        const taskCheck = await pool.request()
            .input('TaskID', sql.Int, id)
            .query('SELECT TaskID FROM Tasks WHERE TaskID = @TaskID');
            
        if (taskCheck.recordset.length === 0) {
            console.log('ERROR: Task not found:', id);
            return res.status(404).json({ message: 'Task not found' });
        }
        
        // التحقق من وجود جدول UserTaskPriorities
        const tableCheck = await pool.request()
            .query(`
                SELECT COUNT(*) as tableExists 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'UserTaskPriorities'
            `);
            
        if (tableCheck.recordset[0].tableExists === 0) {
            console.log('ERROR: UserTaskPriorities table does not exist');
            return res.status(500).json({ 
                message: 'UserTaskPriorities table not found. Please run the database migration script first.',
                error: 'TABLE_NOT_EXISTS'
            });
        }
        
        // إدراج أو تحديث الأولوية الشخصية
        await pool.request()
            .input('UserID', sql.NVarChar, userId)
            .input('TaskID', sql.Int, id)
            .input('Priority', sql.NVarChar, priority)
            .query(`
                MERGE UserTaskPriorities AS target
                USING (SELECT @UserID AS UserID, @TaskID AS TaskID, @Priority AS Priority) AS source
                ON target.UserID = source.UserID AND target.TaskID = source.TaskID
                WHEN MATCHED THEN
                    UPDATE SET Priority = source.Priority, UpdatedAt = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (UserID, TaskID, Priority, CreatedAt, UpdatedAt)
                    VALUES (source.UserID, source.TaskID, source.Priority, GETDATE(), GETDATE());
            `);
            
        console.log('SUCCESS: User task priority updated successfully');
        res.status(200).json({ message: 'User task priority updated successfully' });
    } catch (error) {
        console.error('UPDATE USER TASK PRIORITY ERROR:', error.message);
        console.error('Full error:', error);
        res.status(500).json({ 
            message: 'Error updating user task priority',
            error: error.message
        });
    }
};

// دالة للحصول على الأولوية الشخصية للمستخدم
exports.getUserTaskPriority = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
        return res.status(400).json({ message: 'User ID is required' });
    }
    
    try {
        const result = await pool.request()
            .input('UserID', sql.NVarChar, userId)
            .input('TaskID', sql.Int, id)
            .query(`
                SELECT Priority 
                FROM UserTaskPriorities 
                WHERE UserID = @UserID AND TaskID = @TaskID
            `);
            
        if (result.recordset.length === 0) {
            // إذا لم توجد أولوية شخصية، إرجاع الأولوية الافتراضية
            return res.status(200).json({ priority: 'normal' });
        }
        
        res.status(200).json({ priority: result.recordset[0].Priority });
    } catch (error) {
        console.error('GET USER TASK PRIORITY ERROR:', error);
        res.status(500).json({ message: 'Error getting user task priority' });
    }
};

exports.deleteTask = async (req, res) => {
  const pool = req.app.locals.db;
  const { id: taskId } = req.params;
  const { userId, isAdmin } = req.body;

  // تحويل taskId إلى integer
  const taskIdInt = parseInt(taskId, 10);

  if (!userId) {
    return res.status(401).json({ message: 'User identification is required.' });
  }
  
  if (isNaN(taskIdInt)) {
    return res.status(400).json({ message: 'Invalid task ID' });
  }

  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    
    const accessCheck = await checkTaskAccess(pool, taskIdInt, userId, isAdmin === 'true', 'delete');
    
    if (!accessCheck.hasAccess) {
      await transaction.rollback();
      return res.status(403).json({ message: accessCheck.reason });
    }
    
    // حذف التعليقات المرتبطة بالمهمة
    await new sql.Request(transaction)
      .input('TaskID', sql.Int, taskIdInt)
      .query('DELETE FROM Comments WHERE TaskID = @TaskID');
    
    // حذف المهام الفرعية
    await new sql.Request(transaction)
      .input('TaskID', sql.Int, taskIdInt)
      .query('DELETE FROM Subtasks WHERE TaskID = @TaskID');
    
    // حذف المهمة الرئيسية
    await new sql.Request(transaction)
      .input('TaskID', sql.Int, taskIdInt)
      .query('DELETE FROM Tasks WHERE TaskID = @TaskID');
    
    await transaction.commit();
    res.status(200).json({ message: 'Task and all related data deleted successfully' });
    
  } catch (error) {
    await transaction.rollback();
    console.error('DATABASE DELETE TASK ERROR:', error);
    res.status(500).send({ message: 'Error deleting task' });
  }
};

// تحديث آخر مشاهدة للمهمة
exports.updateTaskView = async (req, res) => {
    const pool = req.app.locals.db;
    const { taskId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ message: 'userId is required' });
    }
    
    try {
        await pool.request()
            .input('UserID', sql.NVarChar, userId)
            .input('TaskID', sql.Int, taskId)
            .query(`
                MERGE TaskViews AS target
                USING (SELECT @UserID AS UserID, @TaskID AS TaskID) AS source
                ON target.UserID = source.UserID AND target.TaskID = source.TaskID
                WHEN MATCHED THEN
                    UPDATE SET LastViewedAt = GETDATE()
                WHEN NOT MATCHED THEN
                    INSERT (UserID, TaskID, LastViewedAt)
                    VALUES (source.UserID, source.TaskID, GETDATE());
            `);
        res.status(200).json({ message: 'Task view updated successfully' });
    } catch (error) {
        console.error('UPDATE TASK VIEW ERROR:', error);
        res.status(500).send({ message: 'Error updating task view' });
    }
};

// تحديث رابط المهمة الخارجي (URL)
exports.updateTaskUrl = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    let { url, Description, userId, isAdmin } = req.body;

    if (!userId) {
        return res.status(401).json({ message: 'User identification is required.' });
    }

    try {
        // التحقق من الصلاحية
        const accessCheck = await checkTaskAccess(pool, id, userId, isAdmin === true || isAdmin === 'true', 'edit');
        if (!accessCheck.hasAccess) {
            return res.status(403).json({ message: accessCheck.reason || 'ليس لديك صلاحية لتعديل هذه المهمة' });
        }
    } catch (error) {
        console.error('ACCESS CHECK ERROR:', error);
        return res.status(500).json({ message: 'Error checking access permissions' });
    }

    // قبول إفراغ الرابط بإرسال قيمة فارغة
    if (url !== undefined && typeof url === 'string') {
        url = url.trim();
        if (url.length === 0) {
            url = null;
        }
    }

    // التحقق الأساسي من المدخلات الخاصة بالرابط
    if (url !== null && url !== undefined && typeof url !== 'string') {
        return res.status(400).json({ message: 'Invalid url type' });
    }
    if (url && url.length > 1000) {
        return res.status(400).json({ message: 'URL is too long (max 1000 chars)' });
    }

    // تجهيز وصف المهمة (اختياري)
    let hasDescription = false;
    let encryptedDescription = null;
    if (typeof Description !== 'undefined') {
        hasDescription = true;
        if (Description && typeof Description === 'string') {
            try {
                encryptedDescription = encryptionConfig.encrypt(Description);
            } catch (e) {
                return res.status(500).json({ message: 'Error encrypting description' });
            }
        } else {
            encryptedDescription = null;
        }
    }

    try {
        const request = pool.request()
            .input('TaskID', sql.Int, id)
            .input('URL', sql.NVarChar, url || null)
            .input('HasDescription', sql.Bit, hasDescription ? 1 : 0)
            .input('Description', sql.NVarChar, encryptedDescription);

        const updateQuery = `
            UPDATE Tasks
            SET
              URL = @URL,
              Description = CASE WHEN @HasDescription = 1 THEN @Description ELSE Description END
            WHERE TaskID = @TaskID
        `;

        await request.query(updateQuery);
        res.status(200).json({ message: 'Task updated successfully' });
    } catch (error) {
        console.error('UPDATE TASK URL ERROR:', error);
        res.status(500).send({ message: 'Error updating task URL/description' });
    }
};

// تحديث عنوان المهمة
exports.updateTaskTitle = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    let { Title, userId, isAdmin } = req.body;

    if (!userId) {
        return res.status(401).json({ message: 'User identification is required.' });
    }

    if (typeof Title !== 'string') {
        return res.status(400).json({ message: 'Title is required and must be a string.' });
    }

    Title = Title.trim();
    if (!Title) {
        return res.status(400).json({ message: 'Title cannot be empty.' });
    }

    try {
        // التحقق من الصلاحية
        const accessCheck = await checkTaskAccess(pool, id, userId, isAdmin === true || isAdmin === 'true', 'edit');
        if (!accessCheck.hasAccess) {
            return res.status(403).json({ message: accessCheck.reason || 'ليس لديك صلاحية لتعديل هذه المهمة' });
        }
    } catch (error) {
        console.error('ACCESS CHECK ERROR:', error);
        return res.status(500).json({ message: 'Error checking access permissions' });
    }

    let encryptedTitle;
    try {
        encryptedTitle = encryptionConfig.encrypt(Title);
    } catch (e) {
        return res.status(500).json({ message: 'Error encrypting title' });
    }

    try {
        await pool.request()
            .input('TaskID', sql.Int, id)
            .input('Title', sql.NVarChar, encryptedTitle)
            .query(`
                UPDATE Tasks
                SET Title = @Title, UpdatedAt = GETDATE()
                WHERE TaskID = @TaskID
            `);
        return res.status(200).json({ message: 'Task title updated successfully' });
    } catch (error) {
        console.error('UPDATE TASK TITLE ERROR:', error);
        return res.status(500).json({ message: 'Error updating task title' });
    }
};

// الحصول على المهام مع معلومات الإشعارات
exports.getTasksWithNotifications = async (req, res) => {
    const pool = req.app.locals.db;
    const { userId, isAdmin } = req.query;
    
    if (!userId) {
        return res.status(400).json({ message: 'userId is required' });
    }
    
    try {
        const baseQuery = await getTasksQueryWithDelegation(pool, userId, isAdmin === 'true');

        // تعديل الاستعلام لإضافة معلومات الإشعارات مع الحفاظ على ActedByName
        let query = baseQuery.replace(
            'SELECT DISTINCT t.*, creator.FullName as CreatedByName, acted.FullName as ActedByName, c.Name as CategoryName',
            `SELECT DISTINCT
                t.*,
                creator.FullName as CreatedByName,
                acted.FullName as ActedByName,
                c.Name as CategoryName,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM Subtasks s 
                        WHERE s.TaskID = t.TaskID
                    ) THEN 1
                    ELSE 0
                END as HasNewSubtasks,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM TaskAssignmentNotifications tan 
                        WHERE tan.TaskID = t.TaskID 
                        AND tan.AssignedToUserID = '${userId}'
                        AND tan.IsRead = 0
                        AND tan.CreatedAt > ISNULL(tv.LastViewedAt, '1900-01-01')
                    ) THEN 1
                    ELSE 0
                END as HasAssignmentNotifications,
                (
                    SELECT COUNT(*) 
                    FROM CommentNotifications cn
                    WHERE cn.TaskID = t.TaskID
                      AND cn.NotifyUserID = '${userId}'
                      AND cn.IsRead = 0
                      AND cn.CreatedAt > ISNULL(tv.LastViewedAt, '1900-01-01')
                ) as HasCommentNotifications`
        );

        // دعم صيغة المدير بدون DISTINCT
        query = query.replace(
            'SELECT t.*, creator.FullName as CreatedByName, acted.FullName as ActedByName, c.Name as CategoryName',
            `SELECT
                t.*,
                creator.FullName as CreatedByName,
                acted.FullName as ActedByName,
                c.Name as CategoryName,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM Subtasks s 
                        WHERE s.TaskID = t.TaskID
                    ) THEN 1
                    ELSE 0
                END as HasNewSubtasks,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM TaskAssignmentNotifications tan 
                        WHERE tan.TaskID = t.TaskID 
                        AND tan.AssignedToUserID = '${userId}'
                        AND tan.IsRead = 0
                        AND tan.CreatedAt > ISNULL(tv.LastViewedAt, '1900-01-01')
                    ) THEN 1
                    ELSE 0
                END as HasAssignmentNotifications,
                (
                    SELECT COUNT(*) 
                    FROM CommentNotifications cn
                    WHERE cn.TaskID = t.TaskID
                      AND cn.NotifyUserID = '${userId}'
                      AND cn.IsRead = 0
                      AND cn.CreatedAt > ISNULL(tv.LastViewedAt, '1900-01-01')
                ) as HasCommentNotifications`
        );

        // إضافة الربط مع TaskViews لأي صيغة
        query = query.replace(
            'LEFT JOIN Categories c ON t.CategoryID = c.CategoryID',
            `LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
             LEFT JOIN TaskViews tv ON tv.TaskID = t.TaskID AND tv.UserID = '${userId}'`
        );
        
        const request = pool.request();
        const result = await request.query(query);
        const tasks = result.recordset.map(t => {
            if (t.Description) {
                try { t.Description = encryptionConfig.decrypt(t.Description); } catch (e) {}
            }
            if (t.Title) {
                try { t.Title = encryptionConfig.decrypt(t.Title); } catch (e) {}
            }
            return t;
        });
        res.status(200).json(tasks);
    } catch (error) {
        console.error('GET TASKS WITH NOTIFICATIONS ERROR:', error);
        res.status(500).send({ message: 'Error fetching tasks with notifications' });
    }
};

// تحديث تصنيف المهمة
exports.updateTaskCategory = async (req, res) => {
    const pool = req.app.locals.db;
    const { taskId } = req.params;
    const { CategoryID, userId, isAdmin } = req.body;
    
    if (!userId) {
        return res.status(401).json({ message: 'User identification is required.' });
    }

    try {
        // التحقق من الصلاحية
        const accessCheck = await checkTaskAccess(pool, taskId, userId, isAdmin === true || isAdmin === 'true', 'edit');
        if (!accessCheck.hasAccess) {
            return res.status(403).json({ message: accessCheck.reason || 'ليس لديك صلاحية لتعديل هذه المهمة' });
        }

        const request = pool.request();
        request.input('TaskID', sql.Int, taskId);
        request.input('CategoryID', sql.Int, CategoryID);
        
        const updateQuery = `
            UPDATE Tasks 
            SET CategoryID = @CategoryID, UpdatedAt = GETDATE()
            WHERE TaskID = @TaskID
        `;
        
        await request.query(updateQuery);
        res.status(200).json({ message: 'تم تحديث تصنيف المهمة بنجاح' });
    } catch (error) {
        console.error('UPDATE TASK CATEGORY ERROR:', error);
        res.status(500).json({ message: 'خطأ في تحديث تصنيف المهمة' });
    }
};

// الحصول على المهام المكتملة للمستخدم (عند الحاجة فقط، مع دعم التصفح على دفعات)
exports.getCompletedTasks = async (req, res) => {
    const pool = req.app.locals.db;
    const { userId, isAdmin } = req.query;
    if (!userId) {
        return res.status(401).json({ message: 'User identification is required.' });
    }

    // إعداد معلومات التصفح (الصفحة والحجم)
    let { page = 1, pageSize = 10 } = req.query;
    page = parseInt(page, 10) || 1;
    pageSize = parseInt(pageSize, 10) || 10;
    if (page < 1) page = 1;
    if (pageSize < 1) pageSize = 10;
    if (pageSize > 100) pageSize = 100;
    const offset = (page - 1) * pageSize;

    try {
        let query;

        if (isAdmin === 'true') {
            // المدير يرى جميع المهام المكتملة/الملغاة
            query = `
                SELECT t.*, creator.FullName as CreatedByName, acted.FullName as ActedByName, c.Name as CategoryName
                FROM Tasks t
                LEFT JOIN Users creator ON t.CreatedBy = creator.UserID
                LEFT JOIN Users acted ON t.ActedBy = acted.UserID
                LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
                WHERE t.Status IN ('completed', 'cancelled')
                ORDER BY t.CreatedAt DESC
                OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
            `;
        } else {
            // المستخدم العادي: المهام المكتملة/الملغاة التي أنشأها أو لديه فيها مهام فرعية
            query = `
                SELECT DISTINCT t.*, creator.FullName as CreatedByName, acted.FullName as ActedByName, c.Name as CategoryName
                FROM Tasks t
                LEFT JOIN Users creator ON t.CreatedBy = creator.UserID
                LEFT JOIN Users acted ON t.ActedBy = acted.UserID
                LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
                WHERE t.Status IN ('completed', 'cancelled')
                  AND (
                    t.CreatedBy = '${userId}'
                    OR EXISTS (
                        SELECT 1 FROM Subtasks s 
                        WHERE s.TaskID = t.TaskID AND s.AssignedTo = '${userId}'
                    )
                  )
                ORDER BY t.CreatedAt DESC
                OFFSET ${offset} ROWS FETCH NEXT ${pageSize} ROWS ONLY
            `;
        }

        const request = pool.request();
        const result = await request.query(query);
        const tasks = result.recordset.map(t => {
            if (t.Description) {
                try { t.Description = encryptionConfig.decrypt(t.Description); } catch (e) {}
            }
            if (t.Title) {
                try { t.Title = encryptionConfig.decrypt(t.Title); } catch (e) {}
            }
            return t;
        });

        res.status(200).json(tasks);
    } catch (error) {
        console.error('DATABASE GET COMPLETED TASKS ERROR:', error);
        res.status(500).send({ message: 'Error fetching completed tasks' });
    }
};

// الحصول على سجل تنقلات المهمة - REMOVED
// exports.getTaskTransferHistory was here

// البحث في المهام المكتملة في قاعدة البيانات (العنوان، التفاصيل، المهام الفرعية، التعليقات)
exports.searchCompletedTasks = async (req, res) => {
    const pool = req.app.locals.db;
    const { userId, isAdmin, q } = req.query;

    if (!userId) {
        return res.status(401).json({ message: 'User identification is required.' });
    }
    if (!q || !q.trim()) {
        return res.status(400).json({ message: 'Search query (q) is required.' });
    }

    const searchTerm = q.toLowerCase();

    try {
        let tasksQuery;

        if (isAdmin === 'true') {
            tasksQuery = `
                SELECT t.*, 
                       creator.FullName as CreatedByName, 
                       acted.FullName as ActedByName, 
                       assignee.FullName as AssignedToName,
                       c.Name as CategoryName
                FROM Tasks t
                LEFT JOIN Users creator ON t.CreatedBy = creator.UserID
                LEFT JOIN Users acted ON t.ActedBy = acted.UserID
                LEFT JOIN Users assignee ON t.AssignedTo = assignee.UserID
                LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
                WHERE t.Status IN ('completed', 'cancelled')
                ORDER BY t.CreatedAt DESC
            `;
        } else {
            tasksQuery = `
                SELECT DISTINCT t.*, 
                       creator.FullName as CreatedByName, 
                       acted.FullName as ActedByName, 
                       assignee.FullName as AssignedToName,
                       c.Name as CategoryName
                FROM Tasks t
                LEFT JOIN Users creator ON t.CreatedBy = creator.UserID
                LEFT JOIN Users acted ON t.ActedBy = acted.UserID
                LEFT JOIN Users assignee ON t.AssignedTo = assignee.UserID
                LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
                WHERE t.Status IN ('completed', 'cancelled')
                  AND (
                    t.CreatedBy = '${userId}'
                    OR EXISTS (
                        SELECT 1 FROM Subtasks s 
                        WHERE s.TaskID = t.TaskID AND s.AssignedTo = '${userId}'
                    )
                  )
                ORDER BY t.CreatedAt DESC
            `;
        }

        const tasksResult = await pool.request().query(tasksQuery);
        let tasks = tasksResult.recordset.map(t => {
            if (t.Description) {
                try { t.Description = encryptionConfig.decrypt(t.Description); } catch (e) {}
            }
            if (t.Title) {
                try { t.Title = encryptionConfig.decrypt(t.Title); } catch (e) {}
            }
            return t;
        });

        if (tasks.length === 0) {
            return res.status(200).json([]);
        }

        const taskIds = tasks.map(t => t.TaskID);
        const idsList = taskIds.join(',');

        let subtasksByTaskId = {};
        let commentsByTaskId = {};

        // جلب المهام الفرعية لكل المهام المكتملة
        const subtasksResult = await pool.request().query(`
            SELECT s.*, 
                   u.FullName as AssignedToName,
                   creator.FullName as CreatedByName
            FROM Subtasks s 
            LEFT JOIN Users u ON s.AssignedTo = u.UserID 
            LEFT JOIN Users creator ON s.CreatedBy = creator.UserID
            WHERE s.TaskID IN (${idsList})
            ORDER BY s.CreatedAt DESC
        `);
        subtasksByTaskId = subtasksResult.recordset.reduce((acc, s) => {
            if (s.Title) {
                try { s.Title = encryptionConfig.decrypt(s.Title); } catch (_) {}
            }
            if (!acc[s.TaskID]) acc[s.TaskID] = [];
            acc[s.TaskID].push(s);
            return acc;
        }, {});

        // جلب التعليقات لكل المهام المكتملة
        const commentsResult = await pool.request().query(`
            SELECT c.*, u.FullName as UserName 
            FROM Comments c 
            LEFT JOIN Users u ON c.UserID = u.UserID 
            WHERE c.TaskID IN (${idsList})
            ORDER BY c.CreatedAt DESC
        `);
        commentsByTaskId = commentsResult.recordset.reduce((acc, c) => {
            if (c.Content) {
                try { c.Content = encryptionConfig.decrypt(c.Content); } catch (e) {}
            }
            if (!acc[c.TaskID]) acc[c.TaskID] = [];
            acc[c.TaskID].push(c);
            return acc;
        }, {});

        const filteredTasks = tasks
            .map(t => {
                const taskSubtasks = subtasksByTaskId[t.TaskID] || [];
                const taskComments = commentsByTaskId[t.TaskID] || [];

                const matchesSearch =
                    (t.Title && t.Title.toLowerCase().includes(searchTerm)) ||
                    (t.Description && t.Description.toLowerCase().includes(searchTerm)) ||
                    (t.CreatedByName && t.CreatedByName.toLowerCase().includes(searchTerm)) ||
                    (t.AssignedToName && t.AssignedToName.toLowerCase().includes(searchTerm)) ||
                    (taskSubtasks.length > 0 &&
                        taskSubtasks.some(st => st.Title && st.Title.toLowerCase().includes(searchTerm))) ||
                    (taskComments.length > 0 &&
                        taskComments.some(c => c.Content && c.Content.toLowerCase().includes(searchTerm)));

                if (!matchesSearch) {
                    return null;
                }

                return {
                    ...t,
                    subtasks: taskSubtasks,
                    comments: taskComments
                };
            })
            .filter(t => t !== null);

        res.status(200).json(filteredTasks);
    } catch (error) {
        console.error('DATABASE SEARCH COMPLETED TASKS ERROR:', error);
        res.status(500).send({ message: 'Error searching completed tasks' });
    }
};
