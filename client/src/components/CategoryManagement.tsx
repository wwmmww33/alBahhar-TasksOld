import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiUrl } from '../config/api';

interface Category {
  CategoryID: number;
  Name: string;
  Description: string;
  DepartmentID: number;
  CreatedBy: string;
  CreatedAt: string;
  UpdatedAt: string;
  IsActive: boolean;
  CreatedByName?: string;
  DepartmentName?: string;
}

interface CategoryManagementProps {
  currentUser: {
    UserID: string;
    FullName: string;
    DepartmentID: number | null;
    IsAdmin: boolean;
  };
}

const CategoryManagement: React.FC<CategoryManagementProps> = ({ currentUser }) => {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    departmentId: currentUser.DepartmentID || 0
  });

  // جلب التصنيفات
  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch(getApiUrl(`categories/department/${currentUser.DepartmentID}`));
      if (!response.ok) {
        throw new Error('فشل في جلب التصنيفات');
      }
      const data = await response.json();
      setCategories(data.Categories || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser.DepartmentID) {
      fetchCategories();
    }
  }, [currentUser.DepartmentID]);

  // إضافة تصنيف جديد
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(getApiUrl('categories'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          departmentId: formData.departmentId,
          createdBy: currentUser.UserID
        }),
      });

      if (!response.ok) {
        throw new Error('فشل في إضافة التصنيف');
      }

      await fetchCategories();
      setShowAddForm(false);
      setFormData({ name: '', description: '', departmentId: currentUser.DepartmentID || 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ في إضافة التصنيف');
    }
  };

  // تعديل تصنيف
  const handleEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;

    try {
      const response = await fetch(getApiUrl(`categories/${editingCategory.CategoryID}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          departmentId: formData.departmentId
        }),
      });

      if (!response.ok) {
        throw new Error('فشل في تعديل التصنيف');
      }

      await fetchCategories();
      setEditingCategory(null);
      setFormData({ name: '', description: '', departmentId: currentUser.DepartmentID || 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ في تعديل التصنيف');
    }
  };

  // حذف تصنيف
  const handleDeleteCategory = async (categoryId: number) => {
    if (!confirm('هل أنت متأكد من حذف هذا التصنيف؟')) return;

    try {
      const response = await fetch(getApiUrl(`categories/${categoryId}`), {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('فشل في حذف التصنيف');
      }

      await fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ في حذف التصنيف');
    }
  };

  // بدء تعديل تصنيف
  const startEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.Name,
      description: category.Description,
      departmentId: category.DepartmentID
    });
    setShowAddForm(false);
  };

  // إلغاء التعديل
  const cancelEdit = () => {
    setEditingCategory(null);
    setFormData({ name: '', description: '', departmentId: currentUser.DepartmentID || 0 });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">إدارة التصنيفات</h2>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingCategory(null);
            setFormData({ name: '', description: '', departmentId: currentUser.DepartmentID || 0 });
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          إضافة تصنيف جديد
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* نموذج الإضافة/التعديل */}
      {(showAddForm || editingCategory) && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4">
            {editingCategory ? 'تعديل التصنيف' : 'إضافة تصنيف جديد'}
          </h3>
          <form onSubmit={editingCategory ? handleEditCategory : handleAddCategory}>
            <div className="mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  اسم التصنيف
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                وصف التصنيف
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {editingCategory ? 'حفظ التعديلات' : 'إضافة التصنيف'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  cancelEdit();
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* قائمة التصنيفات */}
      <div className="space-y-4">
        {categories.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            لا توجد تصنيفات متاحة
          </div>
        ) : (
          categories.map((category) => (
            <div key={category.CategoryID} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">{category.Name}</h3>
                  <p className="text-gray-600 mb-2">{category.Description}</p>
                  <div className="text-sm text-gray-500">
                    <span>القسم: {category.DepartmentName || category.DepartmentID}</span>
                    <span className="mx-2">•</span>
                    <span>أنشئ بواسطة: {category.CreatedByName || category.CreatedBy}</span>
                    <span className="mx-2">•</span>
                    <span className="font-semibold">تم الإنشاء في: {new Date(category.CreatedAt).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => navigate(`/categories/${category.CategoryID}`)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm transition-colors"
                  >
                    عرض المعلومات
                  </button>
                  {currentUser && category.CreatedBy === currentUser.UserID && (
                    <>
                      <button
                        onClick={() => startEdit(category)}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded text-sm transition-colors"
                        title="تعديل التصنيف"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.CategoryID)}
                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition-colors"
                        title="حذف التصنيف"
                      >
                        حذف
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CategoryManagement;