// src/components/DepartmentManagement.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Edit, Plus } from 'lucide-react';

type Department = { DepartmentID: number; Name: string; };

const DepartmentManagement = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);

  const fetchDepartments = useCallback(async () => {
    try {
      const response = await fetch('/api/departments');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setDepartments(data);
    } catch (error) {
      console.error("Error fetching departments:", error);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Name: newDepartmentName }),
    });
    setNewDepartmentName('');
    fetchDepartments();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDepartment) return;
    await fetch(`/api/departments/${editingDepartment.DepartmentID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Name: editingDepartment.Name }),
    });
    setEditingDepartment(null);
    fetchDepartments();
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('هل أنت متأكد؟ قد لا تتمكن من حذف قسم مرتبط بمستخدمين.')) {
      try {
        const response = await fetch(`/api/departments/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            const errorData = await response.json();
            alert(errorData.message); // عرض رسالة الخطأ من الخادم
        }
        fetchDepartments();
      } catch (error) {
        alert("An unexpected error occurred.");
      }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* قائمة الأقسام الحالية */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-semibold mb-4">الأقسام الحالية</h2>
        <ul className="space-y-2">
          {departments.map(dep => (
            <li key={dep.DepartmentID} className="flex justify-between items-center p-2 border rounded-md hover:bg-gray-50">
              <span>{dep.Name}</span>
              <div className="flex gap-3">
                <button onClick={() => setEditingDepartment(dep)} className="text-blue-500 hover:text-blue-700"><Edit size={16}/></button>
                <button onClick={() => handleDelete(dep.DepartmentID)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* نموذج الإضافة أو التعديل */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-semibold mb-4">{editingDepartment ? `تعديل قسم: ${editingDepartment.Name}` : 'إضافة قسم جديد'}</h2>
        <form onSubmit={editingDepartment ? handleUpdate : handleCreate} className="space-y-4">
          <input 
            type="text"
            placeholder="اسم القسم"
            value={editingDepartment ? editingDepartment.Name : newDepartmentName}
            onChange={(e) => editingDepartment ? setEditingDepartment({...editingDepartment, Name: e.target.value}) : setNewDepartmentName(e.target.value)}
            required
            className="w-full p-2 border rounded"
          />
          <button type="submit" className="w-full bg-green-500 text-white py-2 rounded-md hover:bg-green-600 flex items-center justify-center gap-2">
            {editingDepartment ? 'حفظ التغييرات' : <><Plus size={18}/> إضافة</>}
          </button>
          {editingDepartment && <button type="button" onClick={() => setEditingDepartment(null)} className="w-full text-center text-sm mt-2 text-gray-500 hover:underline">إلغاء التعديل</button>}
        </form>
      </div>
    </div>
  );
};

export default DepartmentManagement;