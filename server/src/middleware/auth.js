// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const sql = require('mssql');

// Middleware للتحقق من صحة الرمز المميز (Token)
const authenticateToken = async (req, res, next) => {
  try {
    // في هذا النظام، نستخدم UserID مباشرة بدلاً من JWT tokens
    // يمكن تمرير UserID عبر header أو query parameter
    const userId = req.headers['user-id'] || req.query.userId || req.body.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'معرف المستخدم مطلوب للوصول' });
    }
    
    // التحقق من وجود المستخدم في قاعدة البيانات
    const request = new sql.Request();
    request.input('userId', sql.NVarChar(50), userId);
    
    const result = await request.query(`
      SELECT UserID, FullName, DepartmentID, IsAdmin, IsActive 
      FROM Users 
      WHERE UserID = @userId AND IsActive = 1
    `);
    
    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'المستخدم غير موجود أو غير نشط' });
    }
    
    // إضافة معلومات المستخدم إلى الطلب
    req.user = {
      userId: result.recordset[0].UserID,
      fullName: result.recordset[0].FullName,
      departmentId: result.recordset[0].DepartmentID,
      isAdmin: result.recordset[0].IsAdmin,
      isActive: result.recordset[0].IsActive
    };
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'خطأ في التحقق من الهوية' });
  }
};

// Middleware للتحقق من صلاحيات الإدارة
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'صلاحيات الإدارة مطلوبة للوصول' });
  }
  next();
};

// Middleware للتحقق من صلاحيات التفويض
const checkDelegationPermission = (permissionType) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const taskCreatorId = req.params.taskCreatorId || req.body.taskCreatorId;
      
      // إذا كان المستخدم هو منشئ المهمة الأصلي، فله جميع الصلاحيات
      if (userId === taskCreatorId) {
        return next();
      }
      
      // التحقق من صلاحيات التفويض
      const request = new sql.Request();
      request.input('delegatorUserID', sql.NVarChar(50), taskCreatorId);
      request.input('delegateUserID', sql.NVarChar(50), userId);
      request.input('permissionType', sql.NVarChar(50), permissionType);
      
      const result = await request.query(`
        SELECT dbo.fn_CheckTaskDelegationPermission(@delegatorUserID, @delegateUserID, @permissionType) as HasPermission
      `);
      
      if (!result.recordset[0].HasPermission) {
        return res.status(403).json({ error: 'ليس لديك صلاحية لتنفيذ هذا الإجراء' });
      }
      
      next();
    } catch (error) {
      console.error('Delegation permission check error:', error);
      res.status(500).json({ error: 'خطأ في التحقق من صلاحيات التفويض' });
    }
  };
};

module.exports = {
  authenticateToken,
  requireAdmin,
  checkDelegationPermission
};