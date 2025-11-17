// src/components/SubtaskList.tsx
import { Check, Square, Trash2, UserPlus, Calendar, Clock } from 'lucide-react';
import React, { useState } from 'react';
import type { Subtask, User, CurrentUser } from '../types';

type SubtaskListProps = { 
  subtasks: Subtask[]; 
  usersInDepartment: User[]; 
  currentUser: CurrentUser; 
  task: { TaskID: number, CreatedBy: string }; 
  onSubtaskChange: () => void; 
};

const SubtaskList = ({ subtasks, usersInDepartment, currentUser, task, onSubtaskChange }: SubtaskListProps) => {
  const getTodayString = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskDueDate, setNewSubtaskDueDate] = useState(getTodayString());
  const [assignTo, setAssignTo] = useState('');
  const [showInCalendar, setShowInCalendar] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [editingField, setEditingField] = useState<'title' | 'dueDate' | null>(null);

  const canManageAssignments = currentUser.IsAdmin || currentUser.UserID === task.CreatedBy;
  const canAddSubtasks = canManageAssignments || subtasks.some(st => st.AssignedTo === currentUser.UserID);
  const canEditSubtask = (st: Subtask) => canManageAssignments || currentUser.UserID === st.CreatedBy;

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const resp = await fetch('/api/subtasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        TaskID: task.TaskID, Title: newSubtaskTitle, CreatedBy: currentUser.UserID,
        DueDate: newSubtaskDueDate || null, AssignedTo: assignTo || currentUser.UserID,
        ShowInCalendar: showInCalendar
      }),
    });
    if (resp.ok) {
      // إعلام التقويم بالتحديث الفوري
      window.dispatchEvent(new CustomEvent('calendar:subtask:created', { detail: { ShowInCalendar: showInCalendar, DueDate: newSubtaskDueDate } }));
    }
    setNewSubtaskTitle(''); setNewSubtaskDueDate(getTodayString()); setAssignTo(''); setShowInCalendar(false);
    onSubtaskChange();
  };

  const startEditTitle = (subtask: Subtask) => {
    if (!canEditSubtask(subtask)) return;
    setEditingId(subtask.SubtaskID);
    setEditingField('title');
    setEditTitle(subtask.Title || '');
    const d = subtask.DueDate ? new Date(subtask.DueDate) : null;
    if (d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      setEditDueDate(`${y}-${m}-${day}`);
    } else {
      setEditDueDate('');
    }
  };

  const startEditDueDate = (subtask: Subtask) => {
    if (!canEditSubtask(subtask)) return;
    setEditingId(subtask.SubtaskID);
    setEditingField('dueDate');
    setEditTitle(subtask.Title || '');
    const d = subtask.DueDate ? new Date(subtask.DueDate) : null;
    if (d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      setEditDueDate(`${y}-${m}-${day}`);
    } else {
      setEditDueDate('');
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditDueDate('');
    setEditingField(null);
  };

  const saveEdit = async (subtask: Subtask) => {
    try {
      const body: any = {};
      // أرسل فقط الحقول التي عدّلها المستخدم
      if (editTitle !== (subtask.Title || '')) body.Title = editTitle;
      if ((editDueDate || '') !== (subtask.DueDate ? new Date(subtask.DueDate).toISOString().slice(0,10) : '')) {
        body.DueDate = editDueDate || null;
      }
      const resp = await fetch(`/api/subtasks/${subtask.SubtaskID}/details`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (resp.ok) {
        // تحديث التقويم لأن تاريخ الاستحقاق قد يتغيّر
        window.dispatchEvent(new CustomEvent('calendar:refresh'));
        onSubtaskChange();
        cancelEdit();
      } else {
        const msg = await resp.text();
        alert(`فشل الحفظ: ${msg || resp.status}`);
      }
    } catch (_) {}
  };
  
  // تبديل إظهار المهمة الفرعية الحالية في التقويم
  const handleToggleCalendar = async (subtask: Subtask, nextShow: boolean) => {
    try {
      const resp = await fetch(`/api/subtasks/${subtask.SubtaskID}/calendar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ShowInCalendar: nextShow })
      });
      if (resp.ok) {
        // إعلام التقويم بالتحديث الفوري
        window.dispatchEvent(new CustomEvent('calendar:subtask:created'));
        onSubtaskChange();
      }
    } catch (_) {}
  };
  
  const handleToggleStatus = async (subtask: Subtask) => {
    if (subtask.AssignedTo === currentUser.UserID || currentUser.IsAdmin) {
      await fetch(`/api/subtasks/${subtask.SubtaskID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !subtask.IsCompleted }),
      });
      onSubtaskChange();
    } else { alert("ليس لديك الصلاحية لتغيير حالة هذه المهمة."); }
  };

  const handleAssign = async (subtaskId: number, assignedTo: string) => {
    await fetch(`/api/subtasks/${subtaskId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedToUserId: assignedTo || null }),
    });
    onSubtaskChange();
  };

  const handleDelete = async (subtask: Subtask) => {
    if (subtask.CreatedBy === currentUser.UserID || currentUser.IsAdmin) {
      if (window.confirm('هل أنت متأكد من حذف هذه المهمة الفرعية؟')) {
        await fetch(`/api/subtasks/${subtask.SubtaskID}`, { method: 'DELETE' });
        onSubtaskChange();
      }
    } else { alert("ليس لديك الصلاحية لحذف هذه المهمة."); }
  };

  return (
    <div className="mt-8">
      <h3 className="text-xl font-bold text-content mb-4">المهام الفرعية</h3>
      
      {canAddSubtasks && (
        <form onSubmit={handleAddSubtask} className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-4 p-4 border rounded-md border-dashed border-content/20">
          <div className="md:col-span-3">
            <input type="text" value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)} placeholder="عنوان المهمة الفرعية..." required className="w-full p-2 border rounded-md bg-bkg"/>
          </div>
          <input type="date" value={newSubtaskDueDate} onChange={(e) => setNewSubtaskDueDate(e.target.value)} className="p-2 border rounded-md bg-bkg"/>
          <select value={assignTo} onChange={e => setAssignTo(e.target.value)} className="p-2 border rounded-md bg-white dark:bg-gray-700">
              <option value="">إسناد لـ: (نفسي)</option>
              {usersInDepartment.map(user => <option key={user.UserID} value={user.UserID}>{user.FullName}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showInCalendar} onChange={(e) => setShowInCalendar(e.target.checked)} />
            إظهار في التقويم
          </label>
          <button type="submit" className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-dark">إضافة</button>
        </form>
      )}
      
      <div className="space-y-3">
        {subtasks.map(subtask => {
            const canDelete = subtask.CreatedBy === currentUser.UserID || currentUser.IsAdmin;
            const canToggle = subtask.AssignedTo === currentUser.UserID || currentUser.IsAdmin;
            
            return (<div key={subtask.SubtaskID} className="p-3 bg-content/5 rounded-md">
            <div className="flex items-center gap-3">
              <div className="flex-grow flex items-center gap-3">
                 <div onClick={() => handleToggleStatus(subtask)} className={canToggle ? "cursor-pointer" : "cursor-not-allowed opacity-60"}>
                    {subtask.IsCompleted ? <Check className="text-green-500" /> : <Square className="text-content-secondary" />}
                 </div>
                 {editingId === subtask.SubtaskID && editingField === 'title' ? (
                   <input
                     type="text"
                     value={editTitle}
                     onChange={(e) => setEditTitle(e.target.value)}
                     onBlur={() => saveEdit(subtask)}
                     onKeyDown={(e) => {
                       if (e.key === 'Enter') { e.preventDefault(); saveEdit(subtask); }
                       if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                     }}
                     autoFocus
                     className="flex-1 p-1 border rounded bg-bkg"
                   />
                 ) : (
                   <span
                     onDoubleClick={() => startEditTitle(subtask)}
                     onClick={() => startEditTitle(subtask)}
                     className={`${subtask.IsCompleted ? 'line-through text-gray-500' : 'text-content'} ${canEditSubtask(subtask) ? 'cursor-text' : ''}`}
                   >{subtask.Title}</span>
                 )}
                 <span className="text-xs text-content-secondary font-mono ml-2">#{subtask.SubtaskID}</span>
              </div>
              {canDelete && (<button onClick={() => handleDelete(subtask)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>)}
            </div>
            <div className="flex justify-between items-center mt-2 pl-8 text-xs text-content-secondary">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <UserPlus size={14} />
                        <select value={subtask.AssignedTo || ''} onChange={(e) => handleAssign(subtask.SubtaskID, e.target.value)} disabled={!canManageAssignments} className="bg-transparent text-xs focus:outline-none disabled:opacity-70">
                            <option value="">غير مسندة</option>
                            {usersInDepartment.map(user => (<option key={user.UserID} value={user.UserID}>{user.FullName}</option>))}
                        </select>
                    </div>
                    {subtask.CreatedByName && (
                        <div className="flex items-center gap-1">
                            <span className="text-xs text-content-secondary">منشئ: {subtask.CreatedByName}</span>
                        </div>
                    )}
                    {subtask.CreatedAt && (
                        <div className="flex items-center gap-1">
                            <Clock size={14} />
                            <span>تم الإنشاء: {new Date(subtask.CreatedAt).toLocaleString('ar-EG', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                timeZone: 'UTC'
                            })}</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} />
                    {editingId === subtask.SubtaskID && editingField === 'dueDate' ? (
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => { setEditDueDate(e.target.value); saveEdit(subtask); }}
                        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); } }}
                        onBlur={cancelEdit}
                        autoFocus
                        className="p-1 border rounded bg-bkg"
                      />
                    ) : (
                      <span
                        onClick={() => startEditDueDate(subtask)}
                        className={canEditSubtask(subtask) ? 'cursor-pointer' : ''}
                      >
                        الاستحقاق: {subtask.DueDate ? new Date(subtask.DueDate).toLocaleDateString('ar-EG') : 'غير محدد'}
                      </span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={!!(subtask as any).ShowInCalendar}
                      onChange={(e) => handleToggleCalendar(subtask, e.target.checked)}
                    />
                    إظهار في التقويم
                  </label>
                </div>
            </div>
          </div>);
        })}
      </div>
    </div>
  );
};
export default SubtaskList;