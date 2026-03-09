// src/utils/delegationUtils.js
const sql = require('mssql');

async function checkDelegationPermission(pool, delegatorUserId, delegateUserId, permissionType) {
  try {
    if (delegatorUserId === delegateUserId) {
      return true;
    }

    const request = pool.request();
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

async function hasActiveDelegation(pool, delegatorUserId, delegateUserId) {
  try {
    if (!delegatorUserId || !delegateUserId) return false;
    if (delegatorUserId === delegateUserId) return true;

    const request = pool.request();
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

async function getDelegatorsForUser(pool, delegateUserId) {
  try {
    const request = pool.request();
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

async function getDelegatesForUser(pool, delegatorUserId) {
  try {
    const request = pool.request();
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

async function getTasksQueryWithDelegation(pool, userId, isAdmin) {
  try {
    if (isAdmin) {
      return `
        SELECT t.*, creator.FullName as CreatedByName, acted.FullName as ActedByName, c.Name as CategoryName,
               CASE WHEN t.CreatedBy = '${userId}' THEN 'owner' ELSE 'admin' END as AccessType
        FROM Tasks t
        LEFT JOIN Users creator ON t.CreatedBy = creator.UserID
        LEFT JOIN Users acted ON t.ActedBy = acted.UserID
        LEFT JOIN Categories c ON t.CategoryID = c.CategoryID
        WHERE t.Status NOT IN ('completed', 'cancelled')
        ORDER BY t.CreatedAt DESC
      `;
    }
    
    const delegators = await getDelegatorsForUser(pool, userId);
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
      WHERE t.Status NOT IN ('completed', 'cancelled')
        AND (
          t.CreatedBy = '${userId}' 
          OR t.AssignedTo = '${userId}'
          OR EXISTS (SELECT 1 FROM Subtasks s_inner WHERE s_inner.TaskID = t.TaskID AND s_inner.AssignedTo = '${userId}')
          ${delegationCondition}
        )
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
      WHERE t.Status NOT IN ('completed', 'cancelled')
        AND (
          t.CreatedBy = '${userId}' 
          OR t.AssignedTo = '${userId}'
          OR EXISTS (SELECT 1 FROM Subtasks s_inner WHERE s_inner.TaskID = t.TaskID AND s_inner.AssignedTo = '${userId}')
        )
      ORDER BY t.CreatedAt DESC
    `;
  }
}

async function checkTaskAccess(pool, taskId, userId, isAdmin, requiredPermission = 'view') {
  try {
    const taskRequest = pool.request();
    taskRequest.input('taskId', sql.Int, taskId);
    
    const taskResult = await taskRequest.query(`
      SELECT TaskID, CreatedBy, Title, AssignedTo
      FROM Tasks
      WHERE TaskID = @taskId
    `);
    
    if (taskResult.recordset.length === 0) {
      return { hasAccess: false, reason: 'المهمة غير موجودة' };
    }
    
    const task = taskResult.recordset[0];
    
    if (isAdmin) {
      return { hasAccess: true, accessType: 'admin', task };
    }
    
    if (task.CreatedBy === userId) {
      return { hasAccess: true, accessType: 'owner', task };
    }

    if (task.AssignedTo === userId) {
      if (requiredPermission === 'view' || requiredPermission === 'edit') {
        return { hasAccess: true, accessType: 'assigned', task };
      }
      return { hasAccess: false, reason: 'صلاحية محدودة - عرض وتعديل فقط' };
    }
    
    const hasDelegationPermission = await checkDelegationPermission(pool, task.CreatedBy, userId, requiredPermission);
    if (hasDelegationPermission) {
      return { hasAccess: true, accessType: 'delegated', task };
    }
    
    const subtaskRequest = pool.request();
    subtaskRequest.input('taskId', sql.Int, taskId);
    subtaskRequest.input('userId', sql.NVarChar(50), userId);
    
    const subtaskResult = await subtaskRequest.query(`
      SELECT COUNT(*) as AssignedSubtasks
      FROM Subtasks
      WHERE TaskID = @taskId AND AssignedTo = @userId
    `);
    
    if (subtaskResult.recordset[0].AssignedSubtasks > 0) {
      // المستخدم مُسند إليه مهام فرعية
      if (requiredPermission === 'view' || requiredPermission === 'edit') {
        return { hasAccess: true, accessType: 'assigned', task };
      } else {
        return { hasAccess: false, reason: 'صلاحية محدودة - عرض وتعديل فقط' };
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
