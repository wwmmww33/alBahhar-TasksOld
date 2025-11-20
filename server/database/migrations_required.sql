/*
  Bahar Task Management - Required DB Migrations (SQL Server)
  هذا السكربت آمن للتنفيذ المتكرر ويضيف/ينشئ العناصر المطلوبة للميزات الجديدة.
  يشمل:
  - إضافة العمود URL في جدول Tasks
  - إضافة أعمدة ActedBy في Tasks/Subtasks/Comments
  - جدول PersonalCalendarEvents + فهرس
  - جدول TaskDelegations + فهارس
  - جدول TaskDelegationPermissions + فهرس
  - دالة dbo.fn_CheckTaskDelegationPermission
  - عمود ShowInCalendar في Subtasks
  - عمود DelegationPasswordHash في Users
  - عمود DelegationSecretHash في TaskDelegations

  ملاحظة: استخدم حساباً لديه صلاحيات ALTER/CREATE على المخطط dbo.
*/

SET NOCOUNT ON;

/* 1) إضافة عمود URL إلى جدول Tasks */
IF COL_LENGTH('dbo.Tasks', 'URL') IS NULL
BEGIN
  PRINT 'Adding URL column to dbo.Tasks...';
  ALTER TABLE dbo.Tasks ADD URL NVARCHAR(1000) NULL;
END
ELSE
BEGIN
  PRINT 'URL column already exists in dbo.Tasks.';
END

/* 2) أعمدة ActedBy في Tasks/Subtasks/Comments */
IF COL_LENGTH('dbo.Tasks', 'ActedBy') IS NULL
BEGIN
  PRINT 'Adding ActedBy column to dbo.Tasks...';
  ALTER TABLE dbo.Tasks ADD ActedBy NVARCHAR(50) NULL;
END
ELSE PRINT 'ActedBy already exists in dbo.Tasks.';

IF COL_LENGTH('dbo.Subtasks', 'ActedBy') IS NULL
BEGIN
  PRINT 'Adding ActedBy column to dbo.Subtasks...';
  ALTER TABLE dbo.Subtasks ADD ActedBy NVARCHAR(50) NULL;
END
ELSE PRINT 'ActedBy already exists in dbo.Subtasks.';

IF COL_LENGTH('dbo.Comments', 'ActedBy') IS NULL
BEGIN
  PRINT 'Adding ActedBy column to dbo.Comments...';
  ALTER TABLE dbo.Comments ADD ActedBy NVARCHAR(50) NULL;
END
ELSE PRINT 'ActedBy already exists in dbo.Comments.';

/* 3) جدول PersonalCalendarEvents (إن لم يكن موجودًا) */
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'PersonalCalendarEvents'
)
BEGIN
  PRINT 'Creating table dbo.PersonalCalendarEvents...';
  CREATE TABLE dbo.PersonalCalendarEvents (
    EventID INT IDENTITY(1,1) PRIMARY KEY,
    UserID NVARCHAR(50) NOT NULL,
    Title NVARCHAR(400) NOT NULL,
    EventDate DATE NOT NULL,
    CreatedAt DATETIME NOT NULL CONSTRAINT DF_PersonalCalendarEvents_CreatedAt DEFAULT(GETDATE())
  );
END
ELSE PRINT 'dbo.PersonalCalendarEvents already exists.';

/* فهرس PersonalCalendarEvents */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes i
  JOIN sys.objects o ON i.object_id = o.object_id
  WHERE o.object_id = OBJECT_ID('dbo.PersonalCalendarEvents')
    AND i.name = 'IX_PersonalCalendarEvents_UserDate'
)
BEGIN
  PRINT 'Creating index IX_PersonalCalendarEvents_UserDate...';
  CREATE INDEX IX_PersonalCalendarEvents_UserDate ON dbo.PersonalCalendarEvents(UserID, EventDate);
END
ELSE PRINT 'Index IX_PersonalCalendarEvents_UserDate already exists.';

/* 4) عمود ShowInCalendar في Subtasks */
IF COL_LENGTH('dbo.Subtasks', 'ShowInCalendar') IS NULL
BEGIN
  PRINT 'Adding ShowInCalendar to dbo.Subtasks...';
  ALTER TABLE dbo.Subtasks 
    ADD ShowInCalendar BIT NOT NULL CONSTRAINT DF_Subtasks_ShowInCalendar DEFAULT(0);
END
ELSE PRINT 'ShowInCalendar already exists in dbo.Subtasks.';

/* 5) عمود DelegationPasswordHash في Users */
IF COL_LENGTH('dbo.Users', 'DelegationPasswordHash') IS NULL
BEGIN
  PRINT 'Adding DelegationPasswordHash to dbo.Users...';
  ALTER TABLE dbo.Users ADD DelegationPasswordHash NVARCHAR(256) NULL;
END
ELSE PRINT 'DelegationPasswordHash already exists in dbo.Users.';

/* 6) جدول TaskDelegations (إن لم يكن موجودًا) */
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'TaskDelegations'
)
BEGIN
  PRINT 'Creating table dbo.TaskDelegations...';
  CREATE TABLE dbo.TaskDelegations (
    DelegationID INT IDENTITY(1,1) PRIMARY KEY,
    DelegatorUserID NVARCHAR(50) NOT NULL,
    DelegateUserID NVARCHAR(50) NOT NULL,
    DelegationType NVARCHAR(20) NOT NULL,
    StartDate DATETIME NOT NULL CONSTRAINT DF_TaskDelegations_StartDate DEFAULT(GETDATE()),
    EndDate DATETIME NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_TaskDelegations_IsActive DEFAULT(1),
    Reason NVARCHAR(500) NULL,
    CreatedAt DATETIME NOT NULL CONSTRAINT DF_TaskDelegations_CreatedAt DEFAULT(GETDATE()),
    UpdatedAt DATETIME NULL,
    CreatedBy NVARCHAR(50) NOT NULL,
    CONSTRAINT CK_TaskDelegations_Type CHECK (DelegationType IN ('full','limited')),
    CONSTRAINT FK_TaskDelegations_Delegator FOREIGN KEY (DelegatorUserID) REFERENCES dbo.Users(UserID),
    CONSTRAINT FK_TaskDelegations_Delegate FOREIGN KEY (DelegateUserID) REFERENCES dbo.Users(UserID)
  );
END
ELSE PRINT 'dbo.TaskDelegations already exists.';

/* فهارس TaskDelegations */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes i JOIN sys.objects o ON i.object_id = o.object_id
  WHERE o.object_id = OBJECT_ID('dbo.TaskDelegations') AND i.name = 'IX_TaskDelegations_Delegator'
)
BEGIN
  PRINT 'Creating index IX_TaskDelegations_Delegator...';
  CREATE INDEX IX_TaskDelegations_Delegator ON dbo.TaskDelegations(DelegatorUserID);
END
ELSE PRINT 'Index IX_TaskDelegations_Delegator already exists.';

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes i JOIN sys.objects o ON i.object_id = o.object_id
  WHERE o.object_id = OBJECT_ID('dbo.TaskDelegations') AND i.name = 'IX_TaskDelegations_Delegate'
)
BEGIN
  PRINT 'Creating index IX_TaskDelegations_Delegate...';
  CREATE INDEX IX_TaskDelegations_Delegate ON dbo.TaskDelegations(DelegateUserID);
END
ELSE PRINT 'Index IX_TaskDelegations_Delegate already exists.';

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes i JOIN sys.objects o ON i.object_id = o.object_id
  WHERE o.object_id = OBJECT_ID('dbo.TaskDelegations') AND i.name = 'IX_TaskDelegations_ActivePeriod'
)
BEGIN
  PRINT 'Creating index IX_TaskDelegations_ActivePeriod...';
  CREATE INDEX IX_TaskDelegations_ActivePeriod ON dbo.TaskDelegations(IsActive, StartDate, EndDate);
END
ELSE PRINT 'Index IX_TaskDelegations_ActivePeriod already exists.';

/* 7) عمود DelegationSecretHash في TaskDelegations */
IF COL_LENGTH('dbo.TaskDelegations', 'DelegationSecretHash') IS NULL
BEGIN
  PRINT 'Adding DelegationSecretHash to dbo.TaskDelegations...';
  ALTER TABLE dbo.TaskDelegations ADD DelegationSecretHash NVARCHAR(256) NULL;
END
ELSE PRINT 'DelegationSecretHash already exists in dbo.TaskDelegations.';

/* 8) جدول TaskDelegationPermissions (إن لم يكن موجودًا) */
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES 
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'TaskDelegationPermissions'
)
BEGIN
  PRINT 'Creating table dbo.TaskDelegationPermissions...';
  CREATE TABLE dbo.TaskDelegationPermissions (
    PermissionID INT IDENTITY(1,1) PRIMARY KEY,
    DelegationID INT NOT NULL,
    PermissionType NVARCHAR(50) NOT NULL,
    IsGranted BIT NOT NULL CONSTRAINT DF_TaskDelegationPermissions_IsGranted DEFAULT(1),
    CONSTRAINT CK_TaskDelegationPermissions_Type CHECK (PermissionType IN ('view','edit','assign','close','delete','create')),
    CONSTRAINT FK_TaskDelegationPermissions_Delegation FOREIGN KEY (DelegationID) REFERENCES dbo.TaskDelegations(DelegationID) ON DELETE CASCADE
  );
END
ELSE PRINT 'dbo.TaskDelegationPermissions already exists.';

/* فهرس TaskDelegationPermissions */
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes i JOIN sys.objects o ON i.object_id = o.object_id
  WHERE o.object_id = OBJECT_ID('dbo.TaskDelegationPermissions') AND i.name = 'IX_TaskDelegationPermissions_Delegation'
)
BEGIN
  PRINT 'Creating index IX_TaskDelegationPermissions_Delegation...';
  CREATE INDEX IX_TaskDelegationPermissions_Delegation 
    ON dbo.TaskDelegationPermissions(DelegationID, PermissionType);
END
ELSE PRINT 'Index IX_TaskDelegationPermissions_Delegation already exists.';

/* 9) الدالة dbo.fn_CheckTaskDelegationPermission (إعادة إنشاء لتوافق مضمون) */
IF OBJECT_ID('dbo.fn_CheckTaskDelegationPermission', 'FN') IS NOT NULL
BEGIN
  PRINT 'Dropping existing dbo.fn_CheckTaskDelegationPermission...';
  DROP FUNCTION dbo.fn_CheckTaskDelegationPermission;
END
GO

PRINT 'Creating dbo.fn_CheckTaskDelegationPermission...';
GO
CREATE FUNCTION dbo.fn_CheckTaskDelegationPermission(
  @DelegatorUserID NVARCHAR(50),
  @DelegateUserID NVARCHAR(50),
  @PermissionType NVARCHAR(50)
)
RETURNS BIT
AS
BEGIN
  DECLARE @HasPermission BIT = 0;

  IF EXISTS (
    SELECT 1 FROM dbo.TaskDelegations 
    WHERE DelegatorUserID = @DelegatorUserID 
      AND DelegateUserID = @DelegateUserID 
      AND IsActive = 1
      AND StartDate <= GETDATE()
      AND (EndDate IS NULL OR EndDate >= GETDATE())
  )
  BEGIN
    DECLARE @DelegationType NVARCHAR(20);
    SELECT TOP 1 @DelegationType = DelegationType 
    FROM dbo.TaskDelegations 
    WHERE DelegatorUserID = @DelegatorUserID 
      AND DelegateUserID = @DelegateUserID 
      AND IsActive = 1
      AND StartDate <= GETDATE()
      AND (EndDate IS NULL OR EndDate >= GETDATE());

    IF @DelegationType = 'full'
      SET @HasPermission = 1;
    ELSE IF @DelegationType = 'limited'
    BEGIN
      IF EXISTS (
        SELECT 1 FROM dbo.TaskDelegations td
        INNER JOIN dbo.TaskDelegationPermissions tdp ON td.DelegationID = tdp.DelegationID
        WHERE td.DelegatorUserID = @DelegatorUserID 
          AND td.DelegateUserID = @DelegateUserID 
          AND td.IsActive = 1
          AND td.StartDate <= GETDATE()
          AND (td.EndDate IS NULL OR td.EndDate >= GETDATE())
          AND tdp.PermissionType = @PermissionType
          AND tdp.IsGranted = 1
      )
        SET @HasPermission = 1;
    END
  END

  RETURN @HasPermission;
END
GO

PRINT 'All required migrations completed.';
GO