// src/components/UserManagement.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Edit, Power, PowerOff } from 'lucide-react';

type User = { UserID: string; FullName: string; DepartmentID: number | null; DepartmentName: string | null; IsActive: boolean; };
type Department = { DepartmentID: number; Name: string; };

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [usersRes, deptsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/departments')
      ]);
      const usersData = await usersRes.json();
      const deptsData = await deptsRes.json();
      setUsers(usersData);
      setDepartments(deptsData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    const payload = {
        FullName: editingUser.FullName,
        DepartmentID: editingUser.DepartmentID,
        IsActive: editingUser.IsActive,
        PasswordHash: newPassword,
    };

    await fetch(`/api/users/${editingUser.UserID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setEditingUser(null);
    setNewPassword('');
    fetchData();
  };
  
  const handleToggleActive = async (user: User) => {
    const payload = { ...user, IsActive: !user.IsActive, PasswordHash: '' }; // نرسل كلمة مرور فارغة لعدم تغييرها
    await fetch(`/api/users/${user.UserID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    fetchData();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
      {/* جدول المستخدمين */}
      <div className="md:col-span-3 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-2xl font-semibold mb-4 text-content">المستخدمون الحاليون</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="border-b border-content/10">
              <tr>
                <th className="p-2 font-semibold">الحالة</th>
                <th className="p-2 font-semibold">الاسم الكامل</th>
                <th className="p-2 font-semibold">القسم</th>
                <th className="p-2 font-semibold">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.UserID} className="border-b border-content/10 hover:bg-content/5">
                  <td className="p-2">
                    <button onClick={() => handleToggleActive(user)} title={user.IsActive ? 'إيقاف المستخدم' : 'تفعيل المستخدم'}>
                      {user.IsActive ? <Power size={18} className="text-green-500"/> : <PowerOff size={18} className="text-red-500"/>}
                    </button>
                  </td>
                  <td className="p-2">{user.FullName}</td>
                  <td className="p-2">{user.DepartmentName || <span className="text-xs text-gray-400">غير محدد</span>}</td>
                  <td className="p-2">
                    <button onClick={() => { setEditingUser(user); setNewPassword(''); }} className="text-primary hover:text-primary-dark">
                      <Edit size={16}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* نموذج التعديل */}
      <div className="md:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h2 className="text-2xl font-semibold mb-4 text-content">{editingUser ? `تعديل: ${editingUser.FullName}` : 'اختر مستخدماً لتعديله'}</h2>
        {editingUser && (
          <form onSubmit={handleUpdate} className="space-y-4">
            <div>
              <label className="text-sm font-medium">الاسم الكامل</label>
              <input type="text" value={editingUser.FullName} onChange={(e) => setEditingUser({...editingUser, FullName: e.target.value})} required className="w-full p-2 border rounded mt-1 bg-bkg border-content/20"/>
            </div>
            <div>
              <label className="text-sm font-medium">القسم</label>
              <select value={editingUser.DepartmentID || ''} onChange={(e) => setEditingUser({...editingUser, DepartmentID: parseInt(e.target.value) || null})} required className="w-full p-2 border rounded mt-1 bg-bkg border-content/20">
                <option value="">-- اختر قسماً --</option>
                {departments.map(dep => <option key={dep.DepartmentID} value={dep.DepartmentID}>{dep.Name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">إعادة تعيين كلمة المرور</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="اتركه فارغاً لعدم التغيير" className="w-full p-2 border rounded mt-1 bg-bkg border-content/20"/>
            </div>
            <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="isActive" checked={editingUser.IsActive} onChange={(e) => setEditingUser({...editingUser, IsActive: e.target.checked})} className="h-4 w-4 rounded text-primary focus:ring-primary"/>
                <label htmlFor="isActive" className="text-sm font-medium">الحساب نشط</label>
            </div>
            <div className="border-t border-content/10 pt-4 flex flex-col gap-2">
                <button type="submit" className="w-full bg-primary text-white py-2 rounded-md hover:bg-primary-dark">حفظ التغييرات</button>
                <button type="button" onClick={() => setEditingUser(null)} className="w-full text-center text-sm text-content-secondary hover:underline">إلغاء</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default UserManagement;