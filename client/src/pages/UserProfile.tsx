// src/pages/UserProfile.tsx
import React, { useState, useEffect } from 'react';
import { User, Lock, Building, Save, Eye, EyeOff } from 'lucide-react';
import type { CurrentUser } from '../types';

type Department = {
  DepartmentID: number;
  Name: string;
};

type UserProfileProps = {
  currentUser: CurrentUser;
  onUserUpdate: (updatedUser: CurrentUser) => void;
};

const UserProfile: React.FC<UserProfileProps> = ({ currentUser, onUserUpdate }) => {
  const [fullName, setFullName] = useState(currentUser.FullName);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [departmentId, setDepartmentId] = useState(currentUser.DepartmentID?.toString() || '');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments');
      if (response.ok) {
        const data = await response.json();
        setDepartments(data);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsLoading(true);

    // التحقق من كلمة المرور الجديدة
    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'كلمات المرور الجديدة غير متطابقة' });
      setIsLoading(false);
      return;
    }

    if (newPassword && newPassword.length < 4) {
      setMessage({ type: 'error', text: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل' });
      setIsLoading(false);
      return;
    }

    try {
      const updateData: any = {
        FullName: fullName,
        DepartmentID: departmentId ? parseInt(departmentId) : null,
      };

      // إضافة كلمة المرور الجديدة إذا تم إدخالها
      if (newPassword) {
        updateData.PasswordHash = newPassword;
        updateData.CurrentPassword = currentPassword;
      }

      const response = await fetch(`/api/profile/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...updateData,
          UserID: currentUser.UserID
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ type: 'success', text: 'تم تحديث الملف الشخصي بنجاح' });
        
        // تحديث بيانات المستخدم الحالي
        const updatedUser: CurrentUser = {
          ...currentUser,
          FullName: fullName,
          DepartmentID: departmentId ? parseInt(departmentId) : null,
          DepartmentName: departments.find(d => d.DepartmentID === parseInt(departmentId))?.Name || null
        };
        
        onUserUpdate(updatedUser);
        
        // مسح حقول كلمة المرور
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMessage({ type: 'error', text: data.message || 'حدث خطأ أثناء التحديث' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'حدث خطأ في الاتصال بالخادم' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-bkg border border-content/10 rounded-lg shadow-sm">
        <div className="p-6 border-b border-content/10">
          <h1 className="text-2xl font-bold text-content flex items-center gap-2">
            <User className="h-6 w-6" />
            الملف الشخصي
          </h1>
          <p className="text-content-secondary mt-1">إدارة معلوماتك الشخصية وكلمة المرور</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* معلومات المستخدم الأساسية */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-content flex items-center gap-2">
              <User className="h-5 w-5" />
              المعلومات الأساسية
            </h2>
            
            <div>
              <label htmlFor="userId" className="block text-sm font-medium text-content mb-1">
                معرف المستخدم
              </label>
              <input
                type="text"
                id="userId"
                value={currentUser.UserID}
                disabled
                className="w-full p-3 border border-content/20 rounded-md bg-content/5 text-content-secondary cursor-not-allowed"
              />
              <p className="text-xs text-content-secondary mt-1">لا يمكن تغيير معرف المستخدم</p>
            </div>

            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-content mb-1">
                الاسم الكامل
              </label>
              <input
                type="text"
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full p-3 border border-content/20 rounded-md bg-bkg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="department" className="block text-sm font-medium text-content mb-1">
                القسم
              </label>
              <div className="relative">
                <Building className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-content-secondary" />
                <select
                  id="department"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full p-3 pr-10 border border-content/20 rounded-md bg-bkg focus:ring-2 focus:ring-primary focus:border-primary appearance-none"
                >
                  <option value="">-- اختر القسم --</option>
                  {departments.map((dept) => (
                    <option key={dept.DepartmentID} value={dept.DepartmentID}>
                      {dept.Name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* تغيير كلمة المرور */}
          <div className="space-y-4 border-t border-content/10 pt-6">
            <h2 className="text-lg font-semibold text-content flex items-center gap-2">
              <Lock className="h-5 w-5" />
              تغيير كلمة المرور
            </h2>
            <p className="text-sm text-content-secondary">اتركه فارغاً إذا كنت لا تريد تغيير كلمة المرور</p>

            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-content mb-1">
                كلمة المرور الحالية
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  id="currentPassword"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full p-3 pr-10 border border-content/20 rounded-md bg-bkg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="أدخل كلمة المرور الحالية لتغييرها"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-secondary hover:text-content"
                >
                  {showCurrentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-content mb-1">
                كلمة المرور الجديدة
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-3 pr-10 border border-content/20 rounded-md bg-bkg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="أدخل كلمة المرور الجديدة"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-secondary hover:text-content"
                >
                  {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-content mb-1">
                تأكيد كلمة المرور الجديدة
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-3 pr-10 border border-content/20 rounded-md bg-bkg focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="أعد إدخال كلمة المرور الجديدة"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-content-secondary hover:text-content"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* رسائل النجاح والخطأ */}
          {message && (
            <div className={`p-4 rounded-md ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.text}
            </div>
          )}

          {/* زر الحفظ */}
          <div className="border-t border-content/10 pt-6">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-white py-3 px-4 rounded-md hover:bg-primary-dark disabled:bg-content/20 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  حفظ التغييرات
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserProfile;