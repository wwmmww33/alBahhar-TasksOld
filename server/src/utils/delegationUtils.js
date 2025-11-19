// src/utils/delegationUtils.js
const sql = require('mssql');

/**
 * التحقق من صلاحية المستخدم لإدارة مهام مستخدم آخر
 * @param {string} delegatorUserId - معرف المستخدم المفوِّض (منشئ المهمة)
 * @param {string} delegateUserId - معرف المستخدم المفوَّض إليه
 * @param {string} permissionType - نوع الصلاحية المطلوبة
 * @returns {Promise<boolean>} - true إذا كانت الصلاحية متاحة
 */
async function checkDelegationPermission(delegatorUserId, delegateUserId, permissionType) {
  try {
    // إذا كان المستخدم هو نفسه منشئ المهمة، فله جميع الصلاحيات
    if (delegatorUserId === delegateUserId) {
      return true;
    }
    
    const request = new sql.Request();
    request.input('delegatorUserID', sql.NVarChar(50), delegatorUserId);
    request.input('delegateUserID', sql.NVarChar(50), delegateUserId);
    request.input('permissionType', sql.NVarChar(50), permissionType);
    
    const result = await request.query(`
      SELECT dbo.fn_CheckTaskDelegationPermission(@delegatorUserID, @delegateUserID, @permissionType) as HasPermission
    `);
    
    return result.recordset[0].HasPermission === 1;
  } catch (error) {
    console.error('Error checking delegation permission:', error);
    return false;
  }
}

/**
 * التحقق من وجود تفويض نشط بغض النظر عن نوع الصلاحيات
 * يُستخدم لضبط ActedBy عند العمل بالنيابة
 * @param {string} delegatorUserId - معرف المفوِّض (صاحب المهام)
 * @param {string} delegateUserId - معرف المفوَّض إليه
 * @returns {Promise<boolean>} - true إذا كان هناك تفويض نشط حاليًا
 */
async function hasActiveDelegation(delegatorUserId, delegateUserId) {
  try {
    if (!delegatorUserId || !delegateUserId) return false;
    if (delegatorUserId === delegateUserId) return true;

    const request = new sql.Request();
    request.input('delegatorUserID', sql.NVarChar(50), delegatorUserId);
    request.input('delegateUserID', sql.NVarChar(50), delegateUserId);
    const result = await request.query(`
      SELECT COUNT(*) AS Cnt
      FROM dbo.TaskDelegations
      WHERE DelegatorUserID = @delegatorUserID
        AND DelegateUserID = @delegateUserID
        AND IsActive = 1
        AND StartDate <= GETDATE()
        AND (EndDate IS NULL OR EndDate >= GETDATE())
    `);
    return (result.recordset?.[0]?.Cnt || 0) > 0;
  } catch (error) {
    console.error('Error checking active delegation:', error);
    return false;
  }
}

/**
 * الحصول على جميع المستخدمين الذين فوضوا صلاحياتهم للمستخدم الحالي
 * @param {string} delegateUserId - معرف المستخدم المفوَّض إليه
 * @returns {Promise<Array>} - قائمة بالمستخدمين المفوِّضين
 */
async function getDelegatorsForUser(delegateUserId) {
  try {
    const request = new sql.Request();
    request.input('delegateUserID', sql.NVarChar(50), delegateUserId);
    
    const result = await request.query(`
      SELECT DISTINCT 
        d.DelegatorUserID,
        u.FullName as DelegatorName,
        d.DelegationType,
        d.StartDate,
        d.EndDate
      FROM TaskDelegations d
      INNER JOIN Users u ON d.DelegatorUserID = u.UserID
      WHERE d.DelegateUserID = @delegateUserID
      AND d.IsActive = 1
      AND d.StartDate <= GETDATE()
      AND (d.EndDate IS NULL OR d.EndDate >= GETDATE())
    `);
    
    return result.recordset;
  } catch (error) {
    console.error('Error getting delegators for user:', error);
    return [];
  }
}

/**
 * الحصول على جميع المستخدمين المفوَّض إليهم من قبل المستخدم الحالي
 * @param {string} delegatorUserId - معرف المستخدم المفوِّض
 * @returns {Promise<Array>} - قائمة بالمستخدمين المفوَّض إليهم
 */
async function getDelegatesForUser(delegatorUserId) {
  try {
    const request = new sql.Request();
    request.input('delegatorUserID', sql.NVarChar(50), delegatorUserId);
    
    const result = await request.query(`
      SELECT DISTINCT 
        d.DelegateUserID,
        u.FullName as DelegateName,
        d.DelegationType,
        d.StartDate,
        d.EndDate
      FROM TaskDelegations d
      INNER JOIN Users u ON d.DelegateUserID = u.UserID
      WHERE d.DelegatorUserID = @delegatorUserID
      AND d.IsActive = 1
      AND d.StartDate <= GETDATE()
      AND (d.EndDate IS NULL OR d.EndDate >= GETDATE())
    `);
    
    return result.recordset;
  } catch (error) {
    console.error('Error getting delegates for user:', error);
    return [];
  }
}

/**
 * تحديث استعلام المهام لتشمل المهام المفوضة
 * @param {string} userId - معرف المستخدم الحالي
 * @param {boolean} isAdmin - هل المستخدم مدير
 * @returns {Promise<string>} - استعلام SQL محدث
 */
async function getTasksQueryWithDelegation(userId, isAdmin) {
  try {
    if (isAdmin) {
      // المدير يرى جميع المهام
      return `
        SELECT t.*, creator.FullName as CreatedByName, acted.FullName as ActedByName, c.Name as CategoryName,
               CASE WHEN t.CreatedBy = '${userId}' THEN 'owner' ELSE 'admin' END as AccessType
        FROM Tasks t
        LEFT JOIN Users creator ON t.CreatedBy = creator.UserID
        LEFT JOIN Users acted ON t.ActedBy = acted.UserID
        LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
        ORDER BY t.CreatedAt DESC
      `;
    }
    
    // الحصول على المستخدمين المفوِّضين
    const delegators = await getDelegatorsForUser(userId);
    const delegatorIds = delegators.map(d => `'${d.DelegatorUserID}'`).join(',');
    
    let delegationCondition = '';
    if (delegatorIds) {
      delegationCondition = `OR t.CreatedBy IN (${delegatorIds})`;
    }
    
    return `
      SELECT DISTINCT t.*, creator.FullName as CreatedByName, acted.FullName as ActedByName, c.Name as CategoryName,
             CASE 
               WHEN t.CreatedBy = '${userId}' THEN 'owner'
               WHEN t.CreatedBy IN (${delegatorIds || "''"}) THEN 'delegated'
               ELSE 'assigned'
             END as AccessType
      FROM Tasks t
      LEFT JOIN Users creator ON t.CreatedBy = creator.UserID
      LEFT JOIN Users acted ON t.ActedBy = acted.UserID
      LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
      WHERE t.CreatedBy = '${userId}' 
         OR EXISTS (SELECT 1 FROM Subtasks s_inner WHERE s_inner.TaskID = t.TaskID AND s_inner.AssignedTo = '${userId}')
         ${delegationCondition}
      ORDER BY t.CreatedAt DESC
    `;
  } catch (error) {
    console.error('Error building tasks query with delegation:', error);
    // في حالة الخطأ، إرجاع الاستعلام الأساسي
    return `
      SELECT DISTINCT t.*, creator.FullName as CreatedByName, acted.FullName as ActedByName, c.Name as CategoryName,
             'owner' as AccessType
      FROM Tasks t
      LEFT JOIN Users creator ON t.CreatedBy = creator.UserID
      LEFT JOIN Users acted ON t.ActedBy = acted.UserID
      LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
      WHERE t.CreatedBy = '${userId}' 
         OR EXISTS (SELECT 1 FROM Subtasks s_inner WHERE s_inner.TaskID = t.TaskID AND s_inner.AssignedTo = '${userId}')
      ORDER BY t.CreatedAt DESC
    `;
  }
}

/**
 * التحقق من صلاحية الوصول لمهمة معينة
 * @param {number} taskId - معرف المهمة
 * @param {string} userId - معرف المستخدم
 * @param {boolean} isAdmin - هل المستخدم مدير
 * @param {string} requiredPermission - الصلاحية المطلوبة (view, edit, delete, etc.)
 * @returns {Promise<Object>} - معلومات الوصول
 */
async function checkTaskAccess(taskId, userId, isAdmin, requiredPermission = 'view') {
  try {
    // الحصول على معلومات المهمة
    const taskRequest = new sql.Request();
    taskRequest.input('taskId', sql.Int, taskId);
    
    const taskResult = await taskRequest.query(`
      SELECT TaskID, CreatedBy, Title
      FROM Tasks
      WHERE TaskID = @taskId
    `);
    
    if (taskResult.recordset.length === 0) {
      return { hasAccess: false, reason: 'المهمة غير موجودة' };
    }
    
    const task = taskResult.recordset[0];
    
    // المدير له صلاحية الوصول لجميع المهام
    if (isAdmin) {
      return { hasAccess: true, accessType: 'admin', task };
    }
    
    // منشئ المهمة له جميع الصلاحيات
    if (task.CreatedBy === userId) {
      return { hasAccess: true, accessType: 'owner', task };
    }
    
    // التحقق من التفويض
    const hasDelegationPermission = await checkDelegationPermission(task.CreatedBy, userId, requiredPermission);
    if (hasDelegationPermission) {
      return { hasAccess: true, accessType: 'delegated', task };
    }
    
    // التحقق من إسناد المهام الفرعية
    const subtaskRequest = new sql.Request();
    subtaskRequest.input('taskId', sql.Int, taskId);
    subtaskRequest.input('userId', sql.NVarChar(50), userId);
    
    const subtaskResult = await subtaskRequest.query(`
      SELECT COUNT(*) as AssignedSubtasks
      FROM Subtasks
      WHERE TaskID = @taskId AND AssignedTo = @userId
    `);
    
    if (subtaskResult.recordset[0].AssignedSubtasks > 0) {
      // المستخدم مُسند إليه مهام فرعية، له صلاحية العرض فقط
      if (requiredPermission === 'view') {
        return { hasAccess: true, accessType: 'assigned', task };
      } else {
        return { hasAccess: false, reason: 'صلاحية محدودة - عرض فقط' };
      }
    }
    
    return { hasAccess: false, reason: 'ليس لديك صلاحية للوصول لهذه المهمة' };
  } catch (error) {
    console.error('Error checking task access:', error);
    return { hasAccess: false, reason: 'خطأ في التحقق من الصلاحية' };
  }
}

module.exports = {
  checkDelegationPermission,
  hasActiveDelegation,
  getDelegatorsForUser,
  getDelegatesForUser,
  getTasksQueryWithDelegation,
  checkTaskAccess
};