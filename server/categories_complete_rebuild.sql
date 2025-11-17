-- حذف وإعادة إنشاء جداول التصنيفات مع إعدادات ترميز صحيحة
-- تاريخ الإنشاء: يناير 2025

USE [AlBaharTaskManagement]
GO

-- تعيين إعدادات الجلسة للترميز الصحيح
SET LANGUAGE Arabic
GO

-- حذف البيانات أولاً
DELETE FROM [dbo].[CategoryInformation]
GO

-- حذف العلاقة من Tasks إلى Categories مؤقتاً
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_Tasks_Categories]'))
ALTER TABLE [dbo].[Tasks] DROP CONSTRAINT [FK_Tasks_Categories]
GO

DELETE FROM [dbo].[Categories]
GO

-- إعادة تعيين IDENTITY
DBCC CHECKIDENT ('Categories', RESEED, 0)
GO
DBCC CHECKIDENT ('CategoryInformation', RESEED, 0)
GO

-- حذف العلاقات الخارجية
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_CategoryInformation_Categories]'))
ALTER TABLE [dbo].[CategoryInformation] DROP CONSTRAINT [FK_CategoryInformation_Categories]
GO

IF EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_CategoryInformation_Users]'))
ALTER TABLE [dbo].[CategoryInformation] DROP CONSTRAINT [FK_CategoryInformation_Users]
GO

IF EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_Categories_Departments]'))
ALTER TABLE [dbo].[Categories] DROP CONSTRAINT [FK_Categories_Departments]
GO

IF EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'[dbo].[FK_Categories_Users]'))
ALTER TABLE [dbo].[Categories] DROP CONSTRAINT [FK_Categories_Users]
GO

-- حذف الجداول
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CategoryInformation]'))
DROP TABLE [dbo].[CategoryInformation]
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Categories]'))
DROP TABLE [dbo].[Categories]
GO

-- إنشاء جدول التصنيفات مع إعدادات ترميز صحيحة
CREATE TABLE [dbo].[Categories](
	[CategoryID] [int] IDENTITY(1,1) NOT NULL,
	[Name] [nvarchar](100) COLLATE Arabic_100_CI_AS_SC_UTF8 NOT NULL,
	[Description] [nvarchar](500) COLLATE Arabic_100_CI_AS_SC_UTF8 NULL,
	[DepartmentID] [int] NOT NULL,
	[CreatedBy] [nvarchar](50) NOT NULL,
	[CreatedAt] [datetime] NULL DEFAULT GETDATE(),
	[UpdatedAt] [datetime] NULL DEFAULT GETDATE(),
	[IsActive] [bit] NOT NULL DEFAULT 1,
PRIMARY KEY CLUSTERED 
(
	[CategoryID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY]
GO

-- إنشاء جدول معلومات التصنيفات مع إعدادات ترميز صحيحة
CREATE TABLE [dbo].[CategoryInformation](
	[InfoID] [int] IDENTITY(1,1) NOT NULL,
	[CategoryID] [int] NOT NULL,
	[Title] [nvarchar](200) COLLATE Arabic_100_CI_AS_SC_UTF8 NOT NULL,
	[Content] [nvarchar](max) COLLATE Arabic_100_CI_AS_SC_UTF8 NOT NULL,
	[OrderIndex] [int] NOT NULL DEFAULT 0,
	[CreatedBy] [nvarchar](50) NOT NULL,
	[CreatedAt] [datetime] NULL DEFAULT GETDATE(),
	[UpdatedAt] [datetime] NULL DEFAULT GETDATE(),
	[IsActive] [bit] NOT NULL DEFAULT 1,
PRIMARY KEY CLUSTERED 
(
	[InfoID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO

-- إضافة العلاقات (Foreign Keys)
ALTER TABLE [dbo].[Categories] WITH CHECK ADD CONSTRAINT [FK_Categories_Departments] FOREIGN KEY([DepartmentID])
REFERENCES [dbo].[Departments] ([DepartmentID])
GO

ALTER TABLE [dbo].[Categories] CHECK CONSTRAINT [FK_Categories_Departments]
GO

ALTER TABLE [dbo].[Categories] WITH CHECK ADD CONSTRAINT [FK_Categories_Users] FOREIGN KEY([CreatedBy])
REFERENCES [dbo].[Users] ([UserID])
GO

ALTER TABLE [dbo].[Categories] CHECK CONSTRAINT [FK_Categories_Users]
GO

ALTER TABLE [dbo].[CategoryInformation] WITH CHECK ADD CONSTRAINT [FK_CategoryInformation_Categories] FOREIGN KEY([CategoryID])
REFERENCES [dbo].[Categories] ([CategoryID])
ON DELETE CASCADE
GO

ALTER TABLE [dbo].[CategoryInformation] CHECK CONSTRAINT [FK_CategoryInformation_Categories]
GO

ALTER TABLE [dbo].[CategoryInformation] WITH CHECK ADD CONSTRAINT [FK_CategoryInformation_Users] FOREIGN KEY([CreatedBy])
REFERENCES [dbo].[Users] ([UserID])
GO

ALTER TABLE [dbo].[CategoryInformation] CHECK CONSTRAINT [FK_CategoryInformation_Users]
GO

-- إعادة إضافة العلاقة من Tasks إلى Categories
ALTER TABLE [dbo].[Tasks] WITH CHECK ADD CONSTRAINT [FK_Tasks_Categories] FOREIGN KEY([CategoryID])
REFERENCES [dbo].[Categories] ([CategoryID])
GO

ALTER TABLE [dbo].[Tasks] CHECK CONSTRAINT [FK_Tasks_Categories]
GO

PRINT N'تم حذف وإعادة إنشاء جداول التصنيفات مع إعدادات الترميز الصحيحة بنجاح'
GO