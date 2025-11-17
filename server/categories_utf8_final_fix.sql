-- الحل النهائي لمشكلة الترميز العربي
-- استخدام COLLATE Arabic_100_CI_AS_SC_UTF8 لدعم UTF-8

USE [AlBaharTaskManagement]
GO

-- حذف البيانات الموجودة
DELETE FROM [dbo].[CategoryInformation]
GO

DELETE FROM [dbo].[Categories]
GO

-- إعادة تعيين IDENTITY
DBCC CHECKIDENT ('Categories', RESEED, 0)
GO
DBCC CHECKIDENT ('CategoryInformation', RESEED, 0)
GO

-- إدراج البيانات مع COLLATE صريح
INSERT INTO [dbo].[Categories] ([Name], [Description], [DepartmentID], [CreatedBy])
VALUES 
(N'التجنيد' COLLATE Arabic_100_CI_AS_SC_UTF8, N'جميع المهام المتعلقة بعمليات التجنيد والتوظيف' COLLATE Arabic_100_CI_AS_SC_UTF8, 4, N'D1-8013'),
(N'التقاعد' COLLATE Arabic_100_CI_AS_SC_UTF8, N'المهام المتعلقة بإجراءات التقاعد والإحالة' COLLATE Arabic_100_CI_AS_SC_UTF8, 4, N'D1-8013'),
(N'تمديد الخدمة' COLLATE Arabic_100_CI_AS_SC_UTF8, N'المهام الخاصة بطلبات تمديد الخدمة' COLLATE Arabic_100_CI_AS_SC_UTF8, 4, N'D1-8013'),
(N'الترقيات' COLLATE Arabic_100_CI_AS_SC_UTF8, N'المهام المتعلقة بالترقيات والتقييمات' COLLATE Arabic_100_CI_AS_SC_UTF8, 4, N'D1-8013'),
(N'النقل والإعارة' COLLATE Arabic_100_CI_AS_SC_UTF8, N'المهام الخاصة بالنقل والإعارة' COLLATE Arabic_100_CI_AS_SC_UTF8, 4, N'D1-8013')
GO

-- إدراج معلومات التصنيفات
INSERT INTO [dbo].[CategoryInformation] ([CategoryID], [Title], [Content], [OrderIndex], [CreatedBy])
VALUES 
-- معلومات التجنيد
(1, N'شروط التجنيد العامة' COLLATE Arabic_100_CI_AS_SC_UTF8, N'يجب أن يكون المتقدم عماني الجنسية، لا يقل عمره عن 18 سنة ولا يزيد عن 25 سنة، حاصل على شهادة الدبلوم العام أو ما يعادلها، لائق طبياً وبدنياً.' COLLATE Arabic_100_CI_AS_SC_UTF8, 1, N'D1-8013'),
(1, N'الوثائق المطلوبة' COLLATE Arabic_100_CI_AS_SC_UTF8, N'صورة من البطاقة الشخصية، صورة من شهادة الدبلوم العام، صورة من شهادة الميلاد، 4 صور شخصية حديثة، شهادة عدم محكومية.' COLLATE Arabic_100_CI_AS_SC_UTF8, 2, N'D1-8013'),
(1, N'مراحل التجنيد' COLLATE Arabic_100_CI_AS_SC_UTF8, N'1. تقديم الطلب والوثائق
2. الفحص الطبي الأولي
3. اختبارات اللياقة البدنية
4. المقابلة الشخصية
5. الفحص الطبي النهائي
6. إصدار قرار التجنيد' COLLATE Arabic_100_CI_AS_SC_UTF8, 3, N'D1-8013'),

-- معلومات التقاعد
(2, N'أنواع التقاعد' COLLATE Arabic_100_CI_AS_SC_UTF8, N'1. التقاعد الإجباري: عند بلوغ السن القانونية
2. التقاعد الاختياري: بناء على طلب الموظف
3. التقاعد الطبي: لأسباب صحية
4. التقاعد المبكر: في حالات خاصة' COLLATE Arabic_100_CI_AS_SC_UTF8, 1, N'D1-8013'),
(2, N'إجراءات التقاعد' COLLATE Arabic_100_CI_AS_SC_UTF8, N'1. تقديم طلب التقاعد قبل 6 أشهر من التاريخ المحدد
2. مراجعة الملف الوظيفي
3. حساب المستحقات والمعاش
4. إنهاء الإجراءات الإدارية
5. تسليم المهام والممتلكات' COLLATE Arabic_100_CI_AS_SC_UTF8, 2, N'D1-8013'),

-- معلومات تمديد الخدمة
(3, N'شروط تمديد الخدمة' COLLATE Arabic_100_CI_AS_SC_UTF8, N'يحق للموظف طلب تمديد الخدمة بعد بلوغ سن التقاعد الإجباري، بشرط اللياقة الطبية والحاجة الوظيفية، وموافقة الجهة المختصة.' COLLATE Arabic_100_CI_AS_SC_UTF8, 1, N'D1-8013'),
(3, N'مدة التمديد' COLLATE Arabic_100_CI_AS_SC_UTF8, N'يمكن تمديد الخدمة لفترات لا تزيد عن سنتين في كل مرة، بحد أقصى 5 سنوات إجمالية بعد سن التقاعد.' COLLATE Arabic_100_CI_AS_SC_UTF8, 2, N'D1-8013')
GO

PRINT N'تم تطبيق الحل النهائي لمشكلة الترميز العربي'
GO