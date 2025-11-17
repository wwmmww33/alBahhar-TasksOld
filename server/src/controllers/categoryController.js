const sql = require('mssql');
const dbConfig = require('../config/db.config');
const encryptionConfig = require('../config/encryption.config');

// تم إزالة دالة إصلاح الترميز - يجب أن تُخزن البيانات بشكل صحيح في قاعدة البيانات

// الحصول على جميع التصنيفات لقسم معين
const getCategoriesByDepartment = async (req, res) => {
    try {
        const { departmentId } = req.params;
        
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('DepartmentID', sql.Int, departmentId)
            .query(`
                SELECT 
                    c.CategoryID,
                    c.Name,
                    c.Description,
                    c.DepartmentID,
                    c.CreatedBy,
                    c.CreatedAt,
                    c.UpdatedAt,
                    c.IsActive,
                    u.FullName as CreatedByName,
                    d.Name as DepartmentName
                FROM Categories c
                LEFT JOIN Users u ON c.CreatedBy = u.UserID
                LEFT JOIN Departments d ON c.DepartmentID = d.DepartmentID
                WHERE c.DepartmentID = @DepartmentID AND c.IsActive = 1
                ORDER BY c.Name
            `);
        const categories = result.recordset.map(c => {
            if (c.Description) { try { c.Description = encryptionConfig.decrypt(c.Description); } catch (e) {} }
            return c;
        });
        res.json(categories);
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ error: 'خطأ في جلب التصنيفات' });
    }
};

// الحصول على تصنيف واحد مع معلوماته
const getCategoryById = async (req, res) => {
    try {
        const { categoryId } = req.params;
        
        const pool = await sql.connect(dbConfig);
        
        // جلب بيانات التصنيف
        const categoryResult = await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query(`
                SELECT 
                    c.CategoryID,
                    c.Name,
                    c.Description,
                    c.DepartmentID,
                    c.CreatedBy,
                    c.CreatedAt,
                    c.UpdatedAt,
                    c.IsActive,
                    u.FullName as CreatedByName,
                    d.Name as DepartmentName
                FROM Categories c
                LEFT JOIN Users u ON c.CreatedBy = u.UserID
                LEFT JOIN Departments d ON c.DepartmentID = d.DepartmentID
                WHERE c.CategoryID = @CategoryID AND c.IsActive = 1
            `);
        
        if (categoryResult.recordset.length === 0) {
            return res.status(404).json({ error: 'التصنيف غير موجود' });
        }
        
        // جلب معلومات التصنيف
        const infoResult = await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query(`
                SELECT 
                    ci.InfoID,
                    ci.CategoryID,
                    ci.Title,
                    ci.Content,
                    ci.OrderIndex,
                    ci.CreatedBy,
                    ci.CreatedAt,
                    ci.UpdatedAt,
                    ci.IsActive,
                    u.FullName as CreatedByName
                FROM CategoryInformation ci
                LEFT JOIN Users u ON ci.CreatedBy = u.UserID
                WHERE ci.CategoryID = @CategoryID AND ci.IsActive = 1
                ORDER BY ci.OrderIndex, ci.CreatedAt
            `);
        
        const category = categoryResult.recordset[0];
        
        category.information = infoResult.recordset;
        
        res.json(category);
    } catch (error) {
        console.error('Error fetching category:', error);
        res.status(500).json({ error: 'خطأ في جلب التصنيف' });
    }
};

// إنشاء تصنيف جديد
const createCategory = async (req, res) => {
    try {
        const { name, description, departmentId } = req.body;
        const createdBy = req.user?.userId || 'admin'; // مؤقت حتى يتم تفعيل المصادقة
        
        if (!name || !departmentId) {
            return res.status(400).json({ error: 'اسم التصنيف والقسم مطلوبان' });
        }
        
        const pool = await sql.connect(dbConfig);
        
        // التحقق من عدم وجود تصنيف بنفس الاسم في نفس القسم
        const existingCategory = await pool.request()
            .input('Name', sql.NVarChar(100), name)
            .input('DepartmentID', sql.Int, departmentId)
            .query(`
                SELECT CategoryID FROM Categories 
                WHERE Name = @Name AND DepartmentID = @DepartmentID AND IsActive = 1
            `);
        
        if (existingCategory.recordset.length > 0) {
            return res.status(400).json({ error: 'يوجد تصنيف بنفس الاسم في هذا القسم' });
        }
        
        // إنشاء التصنيف الجديد
        const encryptedDescription = description ? encryptionConfig.encrypt(description) : null;
        const result = await pool.request()
            .input('Name', sql.NVarChar(100), name)
            .input('Description', sql.NVarChar(500), encryptedDescription)
            .input('DepartmentID', sql.Int, departmentId)
            .input('CreatedBy', sql.NVarChar(50), createdBy)
            .query(`
                INSERT INTO Categories (Name, Description, DepartmentID, CreatedBy)
                OUTPUT INSERTED.CategoryID
                VALUES (@Name, @Description, @DepartmentID, @CreatedBy)
            `);
        
        const categoryId = result.recordset[0].CategoryID;
        
        // جلب التصنيف المنشأ حديثاً
        const newCategory = await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query(`
                SELECT 
                    c.CategoryID,
                    c.Name,
                    c.Description,
                    c.DepartmentID,
                    c.CreatedBy,
                    c.CreatedAt,
                    c.UpdatedAt,
                    c.IsActive,
                    u.FullName as CreatedByName,
                    d.Name as DepartmentName
                FROM Categories c
                LEFT JOIN Users u ON c.CreatedBy = u.UserID
                LEFT JOIN Departments d ON c.DepartmentID = d.DepartmentID
                WHERE c.CategoryID = @CategoryID
            `);
        const createdCat = newCategory.recordset[0];
        if (createdCat.Description) { try { createdCat.Description = encryptionConfig.decrypt(createdCat.Description); } catch (e) {} }
        res.status(201).json(createdCat);
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ error: 'خطأ في إنشاء التصنيف' });
    }
};

// تحديث تصنيف
const updateCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { name, description } = req.body;
        
        if (!name) {
            return res.status(400).json({ error: 'اسم التصنيف مطلوب' });
        }
        
        const pool = await sql.connect(dbConfig);
        
        // التحقق من وجود التصنيف والصلاحية
        const existingCategory = await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query('SELECT CategoryID, DepartmentID, CreatedBy FROM Categories WHERE CategoryID = @CategoryID AND IsActive = 1');
        
        if (existingCategory.recordset.length === 0) {
            return res.status(404).json({ error: 'التصنيف غير موجود' });
        }
        
        // التحقق من أن المستخدم هو من أنشأ التصنيف
        const userId = req.user?.userId || req.body.createdBy || 'admin';
        if (existingCategory.recordset[0].CreatedBy !== userId) {
            return res.status(403).json({ error: 'ليس لديك صلاحية لتعديل هذا التصنيف' });
        }
        
        // التحقق من عدم وجود تصنيف آخر بنفس الاسم في نفس القسم
        const duplicateCategory = await pool.request()
            .input('Name', sql.NVarChar(100), name)
            .input('DepartmentID', sql.Int, existingCategory.recordset[0].DepartmentID)
            .input('CategoryID', sql.Int, categoryId)
            .query(`
                SELECT CategoryID FROM Categories 
                WHERE Name = @Name AND DepartmentID = @DepartmentID AND CategoryID != @CategoryID AND IsActive = 1
            `);
        
        if (duplicateCategory.recordset.length > 0) {
            return res.status(400).json({ error: 'يوجد تصنيف بنفس الاسم في هذا القسم' });
        }
        
        // تحديث التصنيف
        await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .input('Name', sql.NVarChar(100), name)
            .input('Description', sql.NVarChar(500), description ? encryptionConfig.encrypt(description) : null)
            .query(`
                UPDATE Categories 
                SET Name = @Name, Description = @Description, UpdatedAt = GETDATE()
                WHERE CategoryID = @CategoryID
            `);
        
        // جلب التصنيف المحدث
        const updatedCategory = await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query(`
                SELECT 
                    c.CategoryID,
                    c.Name,
                    c.Description,
                    c.DepartmentID,
                    c.CreatedBy,
                    c.CreatedAt,
                    c.UpdatedAt,
                    c.IsActive,
                    u.FullName as CreatedByName,
                    d.Name as DepartmentName
                FROM Categories c
                LEFT JOIN Users u ON c.CreatedBy = u.UserID
                LEFT JOIN Departments d ON c.DepartmentID = d.DepartmentID
                WHERE c.CategoryID = @CategoryID
            `);
        const updatedCat = updatedCategory.recordset[0];
        if (updatedCat.Description) { try { updatedCat.Description = encryptionConfig.decrypt(updatedCat.Description); } catch (e) {} }
        res.json(updatedCat);
    } catch (error) {
        console.error('Error updating category:', error);
        res.status(500).json({ error: 'خطأ في تحديث التصنيف' });
    }
};

// حذف تصنيف (حذف منطقي)
const deleteCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        
        const pool = await sql.connect(dbConfig);
        
        // التحقق من وجود التصنيف والصلاحية
        const existingCategory = await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query('SELECT CategoryID, CreatedBy FROM Categories WHERE CategoryID = @CategoryID AND IsActive = 1');
        
        if (existingCategory.recordset.length === 0) {
            return res.status(404).json({ error: 'التصنيف غير موجود' });
        }
        
        // التحقق من أن المستخدم هو من أنشأ التصنيف
        const userId = req.user?.userId || req.body.createdBy || 'admin';
        if (existingCategory.recordset[0].CreatedBy !== userId) {
            return res.status(403).json({ error: 'ليس لديك صلاحية لحذف هذا التصنيف' });
        }
        
        // التحقق من عدم وجود مهام مرتبطة بهذا التصنيف
        const linkedTasks = await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query('SELECT COUNT(*) as TaskCount FROM Tasks WHERE CategoryID = @CategoryID');
        
        if (linkedTasks.recordset[0].TaskCount > 0) {
            return res.status(400).json({ error: 'لا يمكن حذف التصنيف لوجود مهام مرتبطة به' });
        }
        
        // حذف التصنيف منطقياً
        await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query('UPDATE Categories SET IsActive = 0, UpdatedAt = GETDATE() WHERE CategoryID = @CategoryID');
        
        // حذف معلومات التصنيف منطقياً
        await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query('UPDATE CategoryInformation SET IsActive = 0, UpdatedAt = GETDATE() WHERE CategoryID = @CategoryID');
        
        res.json({ message: 'تم حذف التصنيف بنجاح' });
    } catch (error) {
        console.error('Error deleting category:', error);
        res.status(500).json({ error: 'خطأ في حذف التصنيف' });
    }
};

// إضافة معلومة جديدة لتصنيف
const addCategoryInformation = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const { title, content, orderIndex, createdBy } = req.body;
        const userId = createdBy || 'admin'; // مؤقت حتى يتم تفعيل المصادقة
        
        if (!content) {
            return res.status(400).json({ error: 'المحتوى مطلوب' });
        }
        
        const pool = await sql.connect(dbConfig);
        
        // التحقق من وجود التصنيف فقط
        const existingCategory = await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query('SELECT CategoryID FROM Categories WHERE CategoryID = @CategoryID AND IsActive = 1');
        
        if (existingCategory.recordset.length === 0) {
            return res.status(404).json({ error: 'التصنيف غير موجود' });
        }
        
        // إضافة المعلومة الجديدة
        const encryptedContent = content ? encryptionConfig.encrypt(content) : null;
        const result = await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .input('Title', sql.NVarChar(200), title)
            .input('Content', sql.NVarChar(sql.MAX), encryptedContent)
            .input('OrderIndex', sql.Int, orderIndex || 0)
            .input('CreatedBy', sql.NVarChar(50), userId)
            .query(`
                INSERT INTO CategoryInformation (CategoryID, Title, Content, OrderIndex, CreatedBy)
                OUTPUT INSERTED.InfoID
                VALUES (@CategoryID, @Title, @Content, @OrderIndex, @CreatedBy)
            `);
        
        const infoId = result.recordset[0].InfoID;
        
        // جلب المعلومة المنشأة حديثاً
        const newInfo = await pool.request()
            .input('InfoID', sql.Int, infoId)
            .query(`
                SELECT 
                    ci.InfoID,
                    ci.CategoryID,
                    ci.Title,
                    ci.Content,
                    ci.OrderIndex,
                    ci.CreatedBy,
                    ci.CreatedAt,
                    ci.UpdatedAt,
                    ci.IsActive,
                    u.FullName as CreatedByName
                FROM CategoryInformation ci
                LEFT JOIN Users u ON ci.CreatedBy = u.UserID
                WHERE ci.InfoID = @InfoID
            `);
        const info = newInfo.recordset[0];
        if (info && info.Content) { try { info.Content = encryptionConfig.decrypt(info.Content); } catch (e) {} }
        res.status(201).json(info);
    } catch (error) {
        console.error('Error adding category information:', error);
        res.status(500).json({ error: 'خطأ في إضافة معلومة التصنيف' });
    }
};

// تحديث معلومة تصنيف
const updateCategoryInformation = async (req, res) => {
    try {
        const { infoId } = req.params;
        const { title, content, orderIndex } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: 'المحتوى مطلوب' });
        }
        
        const pool = await sql.connect(dbConfig);
        
        // التحقق من وجود المعلومة فقط
        const existingInfo = await pool.request()
            .input('InfoID', sql.Int, infoId)
            .query(`
                SELECT ci.InfoID, ci.CategoryID 
                FROM CategoryInformation ci
                JOIN Categories c ON ci.CategoryID = c.CategoryID
                WHERE ci.InfoID = @InfoID AND ci.IsActive = 1 AND c.IsActive = 1
            `);
        
        if (existingInfo.recordset.length === 0) {
            return res.status(404).json({ error: 'المعلومة غير موجودة' });
        }
        
        // تحديث المعلومة
        const encryptedUpdateContent = content ? encryptionConfig.encrypt(content) : null;
        await pool.request()
            .input('InfoID', sql.Int, infoId)
            .input('Title', sql.NVarChar(200), title)
            .input('Content', sql.NVarChar(sql.MAX), encryptedUpdateContent)
            .input('OrderIndex', sql.Int, orderIndex || 0)
            .query(`
                UPDATE CategoryInformation 
                SET Title = @Title, Content = @Content, OrderIndex = @OrderIndex, UpdatedAt = GETDATE()
                WHERE InfoID = @InfoID
            `);
        
        // جلب المعلومة المحدثة
        const updatedInfo = await pool.request()
            .input('InfoID', sql.Int, infoId)
            .query(`
                SELECT 
                    ci.InfoID,
                    ci.CategoryID,
                    ci.Title,
                    ci.Content,
                    ci.OrderIndex,
                    ci.CreatedBy,
                    ci.CreatedAt,
                    ci.UpdatedAt,
                    ci.IsActive,
                    u.FullName as CreatedByName
                FROM CategoryInformation ci
                LEFT JOIN Users u ON ci.CreatedBy = u.UserID
                WHERE ci.InfoID = @InfoID
            `);
        const updated = updatedInfo.recordset[0];
        if (updated && updated.Content) { try { updated.Content = encryptionConfig.decrypt(updated.Content); } catch (e) {} }
        res.json(updated);
    } catch (error) {
        console.error('Error updating category information:', error);
        res.status(500).json({ error: 'خطأ في تحديث معلومة التصنيف' });
    }
};

// حذف معلومة تصنيف
const deleteCategoryInformation = async (req, res) => {
    try {
        const { infoId } = req.params;
        
        const pool = await sql.connect(dbConfig);
        
        // التحقق من وجود المعلومة
        const existingInfo = await pool.request()
            .input('InfoID', sql.Int, infoId)
            .query('SELECT InfoID FROM CategoryInformation WHERE InfoID = @InfoID AND IsActive = 1');
        
        if (existingInfo.recordset.length === 0) {
            return res.status(404).json({ error: 'المعلومة غير موجودة' });
        }
        
        // حذف المعلومة منطقياً
        await pool.request()
            .input('InfoID', sql.Int, infoId)
            .query('UPDATE CategoryInformation SET IsActive = 0, UpdatedAt = GETDATE() WHERE InfoID = @InfoID');
        
        res.json({ message: 'تم حذف المعلومة بنجاح' });
    } catch (error) {
        console.error('Error deleting category information:', error);
        res.status(500).json({ error: 'خطأ في حذف معلومة التصنيف' });
    }
};

// الحصول على معلومات التصنيف فقط
const getCategoryInformation = async (req, res) => {
    try {
        const { categoryId } = req.params;
        
        const pool = await sql.connect(dbConfig);
        
        // جلب معلومات التصنيف
        const infoResult = await pool.request()
            .input('CategoryID', sql.Int, categoryId)
            .query(`
                SELECT 
                    ci.InfoID,
                    ci.CategoryID,
                    ci.Title,
                    ci.Content,
                    ci.OrderIndex,
                    ci.CreatedBy,
                    ci.CreatedAt,
                    ci.UpdatedAt,
                    ci.IsActive,
                    u.FullName as CreatedByName
                FROM CategoryInformation ci
                LEFT JOIN Users u ON ci.CreatedBy = u.UserID
                WHERE ci.CategoryID = @CategoryID AND ci.IsActive = 1
                ORDER BY ci.OrderIndex, ci.CreatedAt
            `);
        const infos = infoResult.recordset.map(i => {
            if (i.Content) { try { i.Content = encryptionConfig.decrypt(i.Content); } catch (e) {} }
            return i;
        });
        res.json(infos);
    } catch (error) {
        console.error('Error fetching category information:', error);
        res.status(500).json({ error: 'خطأ في جلب معلومات التصنيف' });
    }
};

module.exports = {
    getCategoriesByDepartment,
    getCategoryById,
    getCategoryInformation,
    createCategory,
    updateCategory,
    deleteCategory,
    addCategoryInformation,
    updateCategoryInformation,
    deleteCategoryInformation
};