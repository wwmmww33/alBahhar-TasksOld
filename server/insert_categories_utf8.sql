-- إعادة إدراج البيانات العربية بترميز UTF-8 صحيح
-- تأكد من تشغيل هذا السكريبت مع UTF-8 encoding

USE AlBaharTaskManagement;
GO

-- تعيين اللغة العربية
SET LANGUAGE Arabic;
GO

-- إعادة تعيين IDENTITY للجداول
DBCC CHECKIDENT ('Categories', RESEED, 0);
DBCC CHECKIDENT ('CategoryInformation', RESEED, 0);
GO

-- إدراج البيانات في جدول Categories
INSERT INTO Categories (Name, Description, CreatedBy, CreatedDate, DepartmentId)
VALUES 
(N'التطوير والبرمجة', N'قسم خاص بمهام التطوير والبرمجة وتطوير التطبيقات', 1, GETDATE(), 4),
(N'التسويق الرقمي', N'قسم خاص بمهام التسويق الرقمي والإعلانات', 1, GETDATE(), 4),
(N'خدمة العملاء', N'قسم خاص بمهام خدمة العملاء والدعم الفني', 1, GETDATE(), 4);
GO

-- إدراج البيانات في جدول CategoryInformation
INSERT INTO CategoryInformation (CategoryId, Title, Content, CreatedBy, CreatedDate)
VALUES 
(1, N'معلومات التطوير', N'هذا القسم يحتوي على جميع المهام المتعلقة بالتطوير والبرمجة', 1, GETDATE()),
(2, N'معلومات التسويق', N'هذا القسم يحتوي على جميع المهام المتعلقة بالتسويق الرقمي', 1, GETDATE()),
(3, N'معلومات خدمة العملاء', N'هذا القسم يحتوي على جميع المهام المتعلقة بخدمة العملاء', 1, GETDATE());
GO

-- عرض البيانات للتأكد من الإدراج الصحيح
SELECT * FROM Categories;
SELECT * FROM CategoryInformation;
GO

PRINT N'تم إدراج البيانات العربية بنجاح';
GO