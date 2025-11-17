-- إنشاء جدول تفويضات المهام
-- Task Delegations Table Creation Script

USE AlBaharTaskManagement;
GO

-- إنشاء جدول TaskDelegations
CREATE TABLE TaskDelegations (
    DelegationID INT IDENTITY(1,1) PRIMARY KEY,
    DelegatorUserID NVARCHAR(50) NOT NULL,           -- المستخدم المفوِّض (منشئ المهمة الأصلي)
    DelegateUserID NVARCHAR(50) NOT NULL,            -- المستخدم المفوَّض إليه
    DelegationType NVARCHAR(20) NOT NULL DEFAULT 'full', -- نوع التفويض: 'full' أو 'limited'
    StartDate DATETIME NOT NULL DEFAULT GETDATE(),   -- تاريخ بداية التفويض
    EndDate DATETIME NULL,                           -- تاريخ انتهاء التفويض (NULL = غير محدود)
    IsActive BIT NOT NULL DEFAULT 1,                -- حالة التفويض (نشط/غير نشط)
    Reason NVARCHAR(500) NULL,                       -- سبب التفويض (اختياري)
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),   -- تاريخ إنشاء التفويض
    UpdatedAt DATETIME NULL,                         -- تاريخ آخر تحديث
    CreatedBy NVARCHAR(50) NOT NULL,                 -- من أنشأ التفويض
    
    -- القيود والفهارس
    CONSTRAINT FK_TaskDelegations_Delegator FOREIGN KEY (DelegatorUserID) REFERENCES Users(UserID),
    CONSTRAINT FK_TaskDelegations_Delegate FOREIGN KEY (DelegateUserID) REFERENCES Users(UserID),
    CONSTRAINT FK_TaskDelegations_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES Users(UserID),
    CONSTRAINT CK_TaskDelegations_DelegationType CHECK (DelegationType IN ('full', 'limited')),
    CONSTRAINT CK_TaskDelegations_EndDate CHECK (EndDate IS NULL OR EndDate > StartDate),
    CONSTRAINT CK_TaskDelegations_DifferentUsers CHECK (DelegatorUserID != DelegateUserID)
);
GO

-- إنشاء فهرس لتحسين الأداء
CREATE INDEX IX_TaskDelegations_Delegator ON TaskDelegations(DelegatorUserID, IsActive);
CREATE INDEX IX_TaskDelegations_Delegate ON TaskDelegations(DelegateUserID, IsActive);
CREATE INDEX IX_TaskDelegations_DateRange ON TaskDelegations(StartDate, EndDate, IsActive);
GO

-- إنشاء جدول صلاحيات التفويض المحدودة (للتفويض المحدود)
CREATE TABLE TaskDelegationPermissions (
    PermissionID INT IDENTITY(1,1) PRIMARY KEY,
    DelegationID INT NOT NULL,
    PermissionType NVARCHAR(50) NOT NULL,            -- نوع الصلاحية: 'view', 'edit', 'assign', 'close', 'delete'
    IsGranted BIT NOT NULL DEFAULT 1,               -- هل الصلاحية ممنوحة أم لا
    
    CONSTRAINT FK_TaskDelegationPermissions_Delegation FOREIGN KEY (DelegationID) REFERENCES TaskDelegations(DelegationID) ON DELETE CASCADE,
    CONSTRAINT CK_TaskDelegationPermissions_Type CHECK (PermissionType IN ('view', 'edit', 'assign', 'close', 'delete', 'create'))
);
GO

-- إنشاء فهرس لجدول الصلاحيات
CREATE INDEX IX_TaskDelegationPermissions_Delegation ON TaskDelegationPermissions(DelegationID, PermissionType);
GO

-- إنشاء دالة للتحقق من صلاحيات التفويض
CREATE FUNCTION dbo.fn_CheckTaskDelegationPermission(
    @DelegatorUserID NVARCHAR(50),
    @DelegateUserID NVARCHAR(50),
    @PermissionType NVARCHAR(50)
)
RETURNS BIT
AS
BEGIN
    DECLARE @HasPermission BIT = 0;
    
    -- التحقق من وجود تفويض نشط
    IF EXISTS (
        SELECT 1 FROM TaskDelegations 
        WHERE DelegatorUserID = @DelegatorUserID 
        AND DelegateUserID = @DelegateUserID 
        AND IsActive = 1
        AND StartDate <= GETDATE()
        AND (EndDate IS NULL OR EndDate >= GETDATE())
    )
    BEGIN
        -- التحقق من نوع التفويض
        DECLARE @DelegationType NVARCHAR(20);
        SELECT @DelegationType = DelegationType 
        FROM TaskDelegations 
        WHERE DelegatorUserID = @DelegatorUserID 
        AND DelegateUserID = @DelegateUserID 
        AND IsActive = 1
        AND StartDate <= GETDATE()
        AND (EndDate IS NULL OR EndDate >= GETDATE());
        
        -- إذا كان التفويض كامل، فجميع الصلاحيات متاحة
        IF @DelegationType = 'full'
        BEGIN
            SET @HasPermission = 1;
        END
        -- إذا كان التفويض محدود، التحقق من الصلاحيات المحددة
        ELSE IF @DelegationType = 'limited'
        BEGIN
            IF EXISTS (
                SELECT 1 FROM TaskDelegations td
                INNER JOIN TaskDelegationPermissions tdp ON td.DelegationID = tdp.DelegationID
                WHERE td.DelegatorUserID = @DelegatorUserID 
                AND td.DelegateUserID = @DelegateUserID 
                AND td.IsActive = 1
                AND td.StartDate <= GETDATE()
                AND (td.EndDate IS NULL OR td.EndDate >= GETDATE())
                AND tdp.PermissionType = @PermissionType
                AND tdp.IsGranted = 1
            )
            BEGIN
                SET @HasPermission = 1;
            END
        END
    END
    
    RETURN @HasPermission;
END
GO

-- إدراج بيانات تجريبية (اختيارية)
/*
INSERT INTO TaskDelegations (DelegatorUserID, DelegateUserID, DelegationType, StartDate, EndDate, Reason, CreatedBy)
VALUES 
('D1-8013', 'D1-6136', 'full', '2025-01-25', '2025-02-25', 'إجازة شهرية', 'D1-8013'),
('D1-4420', 'D1-4701', 'limited', '2025-01-25', '2025-01-30', 'تفويض محدود لمدة أسبوع', 'D1-4420');

-- إضافة صلاحيات للتفويض المحدود
DECLARE @LimitedDelegationID INT;
SELECT @LimitedDelegationID = DelegationID FROM TaskDelegations WHERE DelegatorUserID = 'D1-4420' AND DelegateUserID = 'D1-4701';

INSERT INTO TaskDelegationPermissions (DelegationID, PermissionType, IsGranted)
VALUES 
(@LimitedDelegationID, 'view', 1),
(@LimitedDelegationID, 'edit', 1),
(@LimitedDelegationID, 'assign', 0),
(@LimitedDelegationID, 'close', 0),
(@LimitedDelegationID, 'delete', 0);
*/

PRINT 'تم إنشاء جداول تفويض المهام بنجاح';
PRINT 'Task Delegation tables created successfully';
GO