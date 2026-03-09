// src/controllers/procedureController.js
const sql = require('mssql');
const encryptionConfig = require('../config/encryption.config');

/**
 * دالة لجلب كل المهام الافتراضية التي يمكن للمستخدم رؤيتها.
 * - المدير يرى كل المهام العامة + مهامه الخاصة.
 * - الموظف يرى المهام العامة في قسمه + مهامه الخاصة.
 */
exports.getAllProcedures = async (req, res) => {
  const pool = req.app.locals.db;
  const { userId, departmentId } = req.query;

  // بناء جملة الاستعلام بشكل ديناميكي وآمن
  let query = `
    SELECT * FROM Procedures 
    WHERE CreatedBy = @CurrentUserID -- دائماً اجلب المهام الخاصة بالمستخدم
  `;

  // إذا لم يكن المستخدم مديراً، أضف شرط جلب المهام العامة لقسمه
  // departmentId سيكون 'null' أو 'undefined' للمدير
  if (departmentId && departmentId !== 'null') {
    query += ` OR (IsPublic = 1 AND DepartmentID = @DepartmentID)`;
  } else if (userId === 'admin') {
    // إذا كان المستخدم هو المدير، اجلب كل المهام العامة من كل الأقسام
    query += ` OR IsPublic = 1`;
  }

  try {
    const request = pool.request().input('CurrentUserID', sql.NVarChar, userId);
    
    // أضف بارامتر القسم فقط إذا كان موجوداً
    if (departmentId && departmentId !== 'null') {
        request.input('DepartmentID', sql.Int, departmentId);
    }

    const result = await request.query(query);
    
    // فك تشفير العناوين قبل إرسالها للعميل
    const procedures = result.recordset.map(proc => {
      if (proc.Title) {
        try {
          proc.Title = encryptionConfig.decrypt(proc.Title);
        } catch (e) {
          // في حالة الفشل، نبقي النص كما هو (قد يكون نصاً غير مشفر)
        }
      }
      return proc;
    });

    res.status(200).json(procedures);
  } catch (error) { 
    console.error('DATABASE GET PROCEDURES ERROR:', error); 
    res.status(500).send({ message: 'Error fetching procedures' }); 
  }
};

// ... في procedureController.js

/**
 * دالة لجلب تفاصيل مهمة افتراضية واحدة بواسطة الـ ID.
 */
exports.getProcedureById = async (req, res) => {
  const pool = req.app.locals.db;
  try {
    const { id } = req.params;
    const result = await pool.request()
      .input('ProcedureID', sql.Int, id)
      .query('SELECT * FROM Procedures WHERE ProcedureID = @ProcedureID');
    
    if (result.recordset.length === 0) {
      return res.status(404).json({ message: 'Procedure not found' });
    }
    
    const procedure = result.recordset[0];
    if (procedure.Title) {
      try {
        procedure.Title = encryptionConfig.decrypt(procedure.Title);
      } catch (e) {}
    }

    res.status(200).json(procedure);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching procedure details' });
  }
};

// ... باقي الدوال
/**
 * دالة لجلب المهام الفرعية المرتبطة بمهمة افتراضية معينة.
 */
exports.getProcedureSubtasks = async (req, res) => {
  const pool = req.app.locals.db;
  try {
    const { id } = req.params;
    const result = await pool.request().input('ProcedureID', sql.Int, id).query('SELECT * FROM ProcedureSubtasks WHERE ProcedureID = @ProcedureID');
    const subtasks = result.recordset.map(st => {
      if (st.Title) {
        try { st.Title = encryptionConfig.decrypt(st.Title); } catch (e) {}
      }
      return st;
    });
    res.status(200).json(subtasks);
  } catch (error) { res.status(500).send({ message: 'Error fetching procedure subtasks' }); }
};

/**
 * دالة لإنشاء مهمة افتراضية جديدة مع مهامها الفرعية.
 */
exports.createProcedure = async (req, res) => {
    const pool = req.app.locals.db;
    const { Title, CreatedBy, DepartmentID, IsPublic, subtasks } = req.body;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        
        // تشفير العنوان قبل الحفظ
        const encTitle = encryptionConfig.encrypt(Title);

        const procResult = await new sql.Request(transaction)
            .input('Title', sql.NVarChar, encTitle)
            .input('CreatedBy', sql.NVarChar, CreatedBy)
            .input('DepartmentID', sql.Int, DepartmentID)
            .input('IsPublic', sql.Bit, IsPublic)
            .query(`INSERT INTO Procedures (Title, CreatedBy, DepartmentID, IsPublic) OUTPUT INSERTED.ProcedureID VALUES (@Title, @CreatedBy, @DepartmentID, @IsPublic);`);
        const newProcedureId = procResult.recordset[0].ProcedureID;
        if (subtasks && subtasks.length > 0) {
            for (const subtask of subtasks) {
                const encTitle = encryptionConfig.encrypt(subtask.title);
                await new sql.Request(transaction)
                    .input('ProcedureID', sql.Int, newProcedureId)
                    .input('Title', sql.NVarChar, encTitle)
                    .input('DueDateOffset', sql.Int, subtask.offset)
                    .query('INSERT INTO ProcedureSubtasks (ProcedureID, Title, DueDateOffset) VALUES (@ProcedureID, @Title, @DueDateOffset)');
            }
        }
        await transaction.commit();
        res.status(201).json({ message: 'Procedure created successfully!', procedureId: newProcedureId });
    } catch (error) {
        await transaction.rollback();
        console.error("DATABASE CREATE PROCEDURE ERROR:", error);
        res.status(500).send({ message: 'Error creating procedure' });
    }
};

/**
 * دالة لتحديث مهمة افتراضية مع مهامها الفرعية.
 */
exports.updateProcedure = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    const { Title, IsPublic, subtasks } = req.body;
    
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();

        // تشفير العنوان قبل التحديث
        const encTitle = encryptionConfig.encrypt(Title);

        await new sql.Request(transaction)
            .input('ProcedureID', sql.Int, id)
            .input('Title', sql.NVarChar, encTitle)
            .input('IsPublic', sql.Bit, IsPublic)
            .query('UPDATE Procedures SET Title = @Title, IsPublic = @IsPublic WHERE ProcedureID = @ProcedureID');

        await new sql.Request(transaction).input('ProcedureID', sql.Int, id).query('DELETE FROM ProcedureSubtasks WHERE ProcedureID = @ProcedureID');
            
        if (subtasks && subtasks.length > 0) {
            for (const subtask of subtasks) {
                const encTitle = encryptionConfig.encrypt(subtask.title);
                await new sql.Request(transaction)
                    .input('ProcedureID', sql.Int, id)
                    .input('Title', sql.NVarChar, encTitle)
                    .input('DueDateOffset', sql.Int, subtask.offset)
                    .query('INSERT INTO ProcedureSubtasks (ProcedureID, Title, DueDateOffset) VALUES (@ProcedureID, @Title, @DueDateOffset)');
            }
        }

        await transaction.commit();
        res.status(200).json({ message: 'Procedure updated successfully!' });
    } catch (error) {
        await transaction.rollback();
        console.error("UPDATE PROCEDURE ERROR:", error);
        res.status(500).send({ message: 'Error updating procedure' });
    }
};

/**
 * دالة لحذف مهمة افتراضية.
 */
exports.deleteProcedure = async (req, res) => {
    const pool = req.app.locals.db;
    const { id } = req.params;
    try {
        await pool.request()
            .input('ProcedureID', sql.Int, id)
            .query('DELETE FROM Procedures WHERE ProcedureID = @ProcedureID');
        res.status(200).json({ message: 'Procedure deleted successfully' });
    } catch (error) {
        console.error("DELETE PROCEDURE ERROR:", error);
        res.status(500).send({ message: 'Error deleting procedure' });
    }
};