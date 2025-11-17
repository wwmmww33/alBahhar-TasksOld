-- إعادة إدراج البيانات العربية مع أسماء الأعمدة الصحيحة
USE AlBaharTaskManagement;
GO

-- إعادة تعيين IDENTITY للجداول
DBCC CHECKIDENT ('Categories', RESEED, 0);
DBCC CHECKIDENT ('CategoryInformation', RESEED, 0);
GO

-- إدراج البيانات في جدول Categories
INSERT INTO Categories (Name, Description, DepartmentID, CreatedBy, CreatedAt, UpdatedAt, IsActive)
VALUES 
(N'التطوير والبرمجة' COLLATE Arabic_CI_AS, N'قسم خاص بمهام التطوير والبرمجة وتطوير التطبيقات' COLLATE Arabic_CI_AS, 4, N'admin' COLLATE Arabic_CI_AS, GETDATE(), GETDATE(), 1),
(N'التسويق الرقمي' COLLATE Arabic_CI_AS, N'قسم خاص بمهام التسويق الرقمي والإعلانات' COLLATE Arabic_CI_AS, 4, N'admin' COLLATE Arabic_CI_AS, GETDATE(), GETDATE(), 1),
(N'خدمة العملاء' COLLATE Arabic_CI_AS, N'قسم خاص بمهام خدمة العملاء والدعم الفني' COLLATE Arabic_CI_AS, 4, N'admin' COLLATE Arabic_CI_AS, GETDATE(), GETDATE(), 1);
GO

-- إدراج البيانات في جدول CategoryInformation
INSERT INTO CategoryInformation (CategoryID, Title, Content, OrderIndex, CreatedBy, CreatedAt, UpdatedAt, IsActive)
VALUES 
(1, N'معلومات التطوير' COLLATE Arabic_CI_AS, N'هذا القسم يحتوي على جميع المهام المتعلقة بالتطوير والبرمجة' COLLATE Arabic_CI_AS, 1, N'admin' COLLATE Arabic_CI_AS, GETDATE(), GETDATE(), 1),
(2, N'معلومات التسويق' COLLATE Arabic_CI_AS, N'هذا القسم يحتوي على جميع المهام المتعلقة بالتسويق الرقمي' COLLATE Arabic_CI_AS, 2, N'admin' COLLATE Arabic_CI_AS, GETDATE(), GETDATE(), 1),
(3, N'معلومات خدمة العملاء' COLLATE Arabic_CI_AS, N'هذا القسم يحتوي على جميع المهام المتعلقة بخدمة العملاء' COLLATE Arabic_CI_AS, 3, N'admin' COLLATE Arabic_CI_AS, GETDATE(), GETDATE(), 1);
GO

-- عرض البيانات للتأكد من الإدراج الصحيح
SELECT CategoryID, Name, Description, DepartmentID, CreatedBy, CreatedAt FROM Categories;
SELECT InformationID, CategoryID, Title, Content, CreatedBy, CreatedAt FROM CategoryInformation;
GO

PRINT 'Data inserted successfully';
GO