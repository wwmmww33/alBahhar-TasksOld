// src/components/DepartmentManagement.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Edit, Plus, ChevronDown, ChevronRight } from 'lucide-react';

type Department = {
  DepartmentID: number;
  Name: string;
  ParentID?: number | null;
  ParentDepartmentID?: number | null;
  IsActive?: boolean | number;
  Active?: boolean | number;
};

type TreeNode = Department & { children: TreeNode[] };

const DepartmentManagement = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [newDepartmentParentId, setNewDepartmentParentId] = useState<number | null>(null);
  const [newDepartmentActive, setNewDepartmentActive] = useState<boolean>(true);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const nameInputRef = React.useRef<HTMLInputElement>(null);

  const fetchDepartments = useCallback(async () => {
    try {
      const response = await fetch('/api/departments');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setDepartments(Array.isArray(data) ? data : []);
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
      body: JSON.stringify({
        Name: newDepartmentName,
        ParentID: newDepartmentParentId ?? null,
        ParentDepartmentID: newDepartmentParentId ?? null,
        IsActive: newDepartmentActive,
        Active: newDepartmentActive,
      }),
    });
    setNewDepartmentName('');
    setNewDepartmentParentId(null);
    setNewDepartmentActive(true);
    fetchDepartments();
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDepartment) return;
    const parentId = normalizeParentId(editingDepartment);
    const isActive = normalizeActive(editingDepartment);
    await fetch(`/api/departments/${editingDepartment.DepartmentID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Name: editingDepartment.Name,
        ParentID: parentId ?? null,
        ParentDepartmentID: parentId ?? null,
        IsActive: isActive,
        Active: isActive,
      }),
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

  const normalizeParentId = (dep: Department): number | null => {
    const pid = dep.ParentID ?? dep.ParentDepartmentID;
    if (pid === undefined || pid === null) return null;
    const n = Number(pid);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeActive = (dep: Department): boolean => {
    const v = dep.IsActive ?? dep.Active;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return true;
  };

  const buildTree = (items: Department[]): TreeNode[] => {
    const map = new Map<number, TreeNode>();
    const roots: TreeNode[] = [];
    items.forEach((d) => {
      map.set(d.DepartmentID, { ...d, children: [] });
    });
    map.forEach((node) => {
      const pid = normalizeParentId(node);
      if (pid && map.has(pid)) {
        map.get(pid)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    // ترتيب أبجدي حسب الاسم
    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.Name.localeCompare(b.Name));
      nodes.forEach((n) => sortNodes(n.children));
    };
    sortNodes(roots);
    return roots;
  };

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleQuickAddChild = (parentId: number) => {
    setEditingDepartment(null);
    setNewDepartmentName('');
    setNewDepartmentParentId(parentId);
    setNewDepartmentActive(true);
    setTimeout(() => {
      nameInputRef.current?.focus();
    }, 0);
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.DepartmentID);
    const isActive = normalizeActive(node);
    return (
      <li key={node.DepartmentID} className="border rounded-md mb-1">
        <div className="flex items-center justify-between p-2" style={{ paddingInlineStart: `${depth * 16 + 8}px` }}>
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <button onClick={() => toggleExpand(node.DepartmentID)} className="text-gray-600 hover:text-gray-800">
                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <span className="w-4 inline-block" />
            )}
            <span className={isActive ? 'text-gray-900' : 'text-gray-400 line-through'}>{node.Name}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isActive ? 'مفعّل' : 'موقّف'}
            </span>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setEditingDepartment(node)} className="text-blue-500 hover:text-blue-700"><Edit size={16}/></button>
            <button onClick={() => handleDelete(node.DepartmentID)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
            <button onClick={() => handleQuickAddChild(node.DepartmentID)} className="text-green-600 hover:text-green-800"><Plus size={16}/></button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <ul className="ml-2">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* قائمة الأقسام الحالية على شكل شجرة */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-semibold mb-4">الأقسام الحالية (شجرة)</h2>
        <ul className="space-y-1">
          {buildTree(departments).map((root) => renderNode(root))}
        </ul>
      </div>

      {/* نموذج الإضافة أو التعديل مع اختيار الأب والتفعيل */}
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
            ref={nameInputRef}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">القسم الأب</label>
              <select
                className="w-full p-2 border rounded"
                value={editingDepartment ? (normalizeParentId(editingDepartment) ?? '') : (newDepartmentParentId ?? '')}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : Number(e.target.value);
                  if (editingDepartment) {
                    setEditingDepartment({ ...editingDepartment, ParentID: val, ParentDepartmentID: val });
                  } else {
                    setNewDepartmentParentId(val);
                  }
                }}
              >
                <option value="">بدون أب</option>
                {departments.map((dep) => (
                  <option key={dep.DepartmentID} value={dep.DepartmentID}>{dep.Name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingDepartment ? normalizeActive(editingDepartment) : newDepartmentActive}
                  onChange={(e) => {
                    const val = e.target.checked;
                    if (editingDepartment) {
                      setEditingDepartment({ ...editingDepartment, IsActive: val, Active: val });
                    } else {
                      setNewDepartmentActive(val);
                    }
                  }}
                />
                <span>مفعّل</span>
              </label>
            </div>
          </div>
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