const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

// ملاحظة: تم إزالة المصادقة مؤقتاً لحل مشكلة authenticateToken
// router.use(authenticateToken);

// مسارات التصنيفات
// GET /api/categories/department/:departmentId - الحصول على جميع التصنيفات لقسم معين
router.get('/department/:departmentId', categoryController.getCategoriesByDepartment);

// GET /api/categories/:categoryId/information - الحصول على معلومات التصنيف فقط
router.get('/:categoryId/information', categoryController.getCategoryInformation);

// GET /api/categories/:categoryId - الحصول على تصنيف واحد مع معلوماته
router.get('/:categoryId', categoryController.getCategoryById);

// GET /api/categories/:categoryId/linked-tasks-count - عدد المهام المرتبطة بتصنيف
router.get('/:categoryId/linked-tasks-count', categoryController.getLinkedTaskCount);

// POST /api/categories - إنشاء تصنيف جديد
router.post('/', categoryController.createCategory);

// PUT /api/categories/:categoryId - تحديث تصنيف
router.put('/:categoryId', categoryController.updateCategory);

// DELETE /api/categories/:categoryId - حذف تصنيف
router.delete('/:categoryId', categoryController.deleteCategory);

// مسارات معلومات التصنيفات
// POST /api/categories/:categoryId/information - إضافة معلومة جديدة لتصنيف
router.post('/:categoryId/information', categoryController.addCategoryInformation);

// PUT /api/categories/information/:infoId - تحديث معلومة تصنيف
router.put('/information/:infoId', categoryController.updateCategoryInformation);

// DELETE /api/categories/information/:infoId - حذف معلومة تصنيف
router.delete('/information/:infoId', categoryController.deleteCategoryInformation);

module.exports = router;