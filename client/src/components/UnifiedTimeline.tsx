// src/components/UnifiedTimeline.tsx
import { Check, Square, Trash2, UserPlus, Calendar, Clock, MessageCircle, CheckSquare } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import type { Subtask, User, CurrentUser } from '../types';
import { useNotification } from '../contexts/NotificationContext';
import { getActiveUserId } from '../utils/activeAccount';

type Comment = {
  CommentID: number;
  Content: string;
  UserID: string;
  UserName?: string;
  CreatedAt: string;
  ActedBy?: string;
  ActedByName?: string;
  ShowInCalendar?: boolean;
};

type TimelineItem = {
  id: string;
  type: 'subtask' | 'comment';
  createdAt: string;
  data: Subtask | Comment;
};

type UnifiedTimelineProps = {
  taskId: string;
  subtasks: Subtask[];
  comments: Comment[];
  users: User[];
  currentUser: CurrentUser;
  task: any;
  onSubtaskUpdate: () => void;
  onCommentSubmit: (commentData: string | { content: string; customDateTime: string | null; showInCalendar?: boolean }) => Promise<void>;
  isSubmittingComment: boolean;
  onCommentsUpdate: () => void;
};

const UnifiedTimeline = ({
  taskId,
  subtasks,
  comments,
  users,
  currentUser,
  task,
  onSubtaskUpdate,
  onCommentSubmit,
  isSubmittingComment,
  onCommentsUpdate
}: UnifiedTimelineProps) => {
  const { refreshTasks, refreshNotifications } = useNotification();
  const renderWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    const elements: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    text.replace(urlRegex, (match, _p1, offset) => {
      if (offset > lastIndex) {
        elements.push(text.slice(lastIndex, offset));
      }
      const href = match.startsWith('http') ? match : `http://${match}`;
      elements.push(
        <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline break-all">
          {match}
        </a>
      );
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < text.length) {
      elements.push(text.slice(lastIndex));
    }
    return elements;
  };
  const getUserNameById = (id?: string) => {
    if (!id) return '';
    return users.find(u => u.UserID === id)?.FullName || id;
  };
  const getTodayString = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const getCurrentDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };
  
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newSubtaskDueDate, setNewSubtaskDueDate] = useState(getTodayString());
  const [assignTo, setAssignTo] = useState('');
  const [showInCalendar, setShowInCalendar] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [useCustomDateTime, setUseCustomDateTime] = useState(false);
  const [customDateTime, setCustomDateTime] = useState(getCurrentDateTime());
  const [showCommentInCalendar, setShowCommentInCalendar] = useState(false);
  const [showSubtaskForm, setShowSubtaskForm] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);

  // حالات التحرير داخل عناصر الجدول الزمني
  const [editingTitleSubtaskId, setEditingTitleSubtaskId] = useState<number | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [editingDueSubtaskId, setEditingDueSubtaskId] = useState<number | null>(null);
  const [editingDueValue, setEditingDueValue] = useState<string>('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentValue, setEditingCommentValue] = useState('');

  const actingUserId = getActiveUserId(currentUser.UserID);
  const canManageAssignments = currentUser.IsAdmin || (task && actingUserId === task.CreatedBy);
  const canAddSubtasks = canManageAssignments || subtasks.some(st => st.AssignedTo === actingUserId);

  // دمج المهام الفرعية والتعليقات وترتيبها حسب التاريخ
  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    // إضافة المهام الفرعية
    subtasks.forEach(subtask => {
      items.push({
        id: `subtask-${subtask.SubtaskID}`,
        type: 'subtask',
        createdAt: subtask.CreatedAt,
        data: subtask
      });
    });

    // إضافة التعليقات
    comments.forEach(comment => {
      items.push({
        id: `comment-${comment.CommentID}`,
        type: 'comment',
        createdAt: comment.CreatedAt,
        data: comment
      });
    });

    // ترتيب العناصر حسب التاريخ (الأحدث أولاً)
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [subtasks, comments]);

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    const resp = await fetch('/api/subtasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        TaskID: taskId,
        Title: newSubtaskTitle,
        CreatedBy: actingUserId,
        ActedBy: currentUser.UserID,
        DueDate: newSubtaskDueDate || null,
        AssignedTo: assignTo || actingUserId,
        ShowInCalendar: showInCalendar
      }),
    });
    setNewSubtaskTitle('');
    setNewSubtaskDueDate(getTodayString());
    setAssignTo('');
    setShowInCalendar(false);
    onSubtaskUpdate();
    if (resp.ok) {
      window.dispatchEvent(new CustomEvent('calendar:subtask:created', { detail: { ShowInCalendar: showInCalendar, DueDate: newSubtaskDueDate } }));
    }
    // تحديث قائمة المهام وربما الإشعارات فورًا
    refreshTasks();
    refreshNotifications();
  };

  const handleToggleStatus = async (subtask: Subtask) => {
    if (subtask.AssignedTo === actingUserId || currentUser.IsAdmin) {
      await fetch(`/api/subtasks/${subtask.SubtaskID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !subtask.IsCompleted }),
      });
      onSubtaskUpdate();
      refreshTasks();
    } else {
      alert("ليس لديك الصلاحية لتغيير حالة هذه المهمة.");
    }
  };

  const handleAssign = async (subtaskId: number, assignedTo: string) => {
    await fetch(`/api/subtasks/${subtaskId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignedToUserId: assignedTo || null }),
    });
    onSubtaskUpdate();
    refreshTasks();
    refreshNotifications();
  };

  // حفظ تفاصيل المهمة الفرعية (العنوان / تاريخ الاستحقاق)
  const saveSubtaskDetails = async (subtaskId: number, payload: Partial<Pick<Subtask, 'Title' | 'DueDate'>>) => {
    try {
      const resp = await fetch(`/api/subtasks/${subtaskId}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        alert(`فشل حفظ التغييرات (${resp.status}). ${text}`);
        return false;
      }
      onSubtaskUpdate();
      refreshTasks();
      return true;
    } catch (err) {
      console.error('Network error while saving subtask details:', err);
      alert('تعذر الاتصال بالخادم أثناء الحفظ. تأكد من تشغيل الخادم وأن البروكسي مفعل.');
      return false;
    }
  };

  // تبديل إظهار المهمة الفرعية الحالية في التقويم
  const handleToggleCalendar = async (subtask: Subtask, nextShow: boolean) => {
    try {
      const url = `/api/subtasks/${subtask.SubtaskID}/calendar`;
      const resp = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ShowInCalendar: nextShow })
      });
      if (resp.ok) {
        window.dispatchEvent(new CustomEvent('calendar:subtask:created'));
        onSubtaskUpdate();
        refreshTasks();
        refreshNotifications();
      } else {
        const text = await resp.text().catch(() => '');
        if (resp.status === 404) {
          alert('لم يتم العثور على المهمة الفرعية (404). قد تكون محذوفة أو رقم المعرف غير صحيح.');
        } else {
          alert(`فشل تحديث التبديل في التقويم (${resp.status}). ${text}`);
        }
      }
    } catch (err) {
      console.error('Network error while toggling calendar flag:', err);
      alert('تعذر الاتصال بالخادم. تأكد من أن الخادم يعمل على المنفذ 5001 وأن البروكسي مفعل.');
    }
  };

  const handleDeleteSubtask = async (subtask: Subtask) => {
    if (subtask.CreatedBy === actingUserId || currentUser.IsAdmin) {
      if (window.confirm('هل أنت متأكد من حذف هذه المهمة الفرعية؟')) {
        await fetch(`/api/subtasks/${subtask.SubtaskID}`, { method: 'DELETE' });
        onSubtaskUpdate();
        refreshTasks();
      }
    } else {
      alert("ليس لديك الصلاحية لحذف هذه المهمة.");
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isSubmittingComment) return;
    
    if (useCustomDateTime) {
      const selectedDate = new Date(customDateTime);
      if (isNaN(selectedDate.getTime())) {
        alert('يرجى إدخال تاريخ ووقت صحيح');
        return;
      }
    }
    
    // تمرير التاريخ المخصص إذا تم تفعيله
    const commentData = {
      content: newComment,
      customDateTime: useCustomDateTime ? customDateTime : null,
      showInCalendar: showCommentInCalendar
    };
    
    await onCommentSubmit(commentData);
    setNewComment('');
    // إعادة تعيين التاريخ المخصص للوقت الحالي
    setCustomDateTime(getCurrentDateTime());
    setShowCommentInCalendar(false);
  };

  const saveComment = async (commentId: number, content: string) => {
    try {
      const resp = await fetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Content: content,
          UserID: actingUserId,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        alert(`فشل حفظ التعديل على التعليق (${resp.status}). ${text}`);
        return false;
      }
      onCommentsUpdate();
      refreshNotifications();
      return true;
    } catch (err) {
      console.error('Network error while saving comment:', err);
      alert('تعذر الاتصال بالخادم أثناء حفظ التعليق. تأكد من تشغيل الخادم.');
      return false;
    }
  };

  const handleDeleteComment = async (comment: Comment) => {
    const canDelete = comment.UserID === actingUserId || comment.ActedBy === actingUserId;
    if (!canDelete) {
      alert('ليس لديك الصلاحية لحذف هذا التعليق.');
      return;
    }
    if (!window.confirm('هل أنت متأكد من حذف هذا التعليق؟')) return;
    try {
      const resp = await fetch(`/api/comments/${comment.CommentID}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserID: actingUserId }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        alert(`فشل حذف التعليق (${resp.status}). ${text}`);
        return;
      }
      onCommentsUpdate();
      refreshNotifications();
    } catch (err) {
      console.error('Network error while deleting comment:', err);
      alert('تعذر الاتصال بالخادم أثناء حذف التعليق. تأكد من تشغيل الخادم.');
    }
  };

  const renderSubtaskItem = (subtask: Subtask) => {
    const canDelete = subtask.CreatedBy === actingUserId || currentUser.IsAdmin;
    const canToggle = subtask.AssignedTo === actingUserId || currentUser.IsAdmin;
    const canEditTitle = subtask.CreatedBy === actingUserId || currentUser.IsAdmin;
    const canEditDue = subtask.CreatedBy === actingUserId || currentUser.IsAdmin;

    return (
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mt-1">
          <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-grow">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-3 mb-2">
              <div
                onClick={() => handleToggleStatus(subtask)}
                className={canToggle ? "cursor-pointer" : "cursor-not-allowed opacity-60"}
              >
                {subtask.IsCompleted ? (
                  <Check className="text-green-500 w-5 h-5" />
                ) : (
                  <Square className="text-content-secondary w-5 h-5" />
                )}
              </div>
              {editingTitleSubtaskId === subtask.SubtaskID ? (
                <input
                  type="text"
                  autoFocus
                  value={editingTitleValue}
                  onChange={(e) => setEditingTitleValue(e.target.value)}
                  onBlur={async () => {
                    const trimmed = editingTitleValue.trim();
                    if (trimmed && trimmed !== subtask.Title) {
                      await saveSubtaskDetails(subtask.SubtaskID, { Title: trimmed });
                    }
                    setEditingTitleSubtaskId(null);
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = editingTitleValue.trim();
                      if (trimmed && trimmed !== subtask.Title) {
                        await saveSubtaskDetails(subtask.SubtaskID, { Title: trimmed });
                      }
                      setEditingTitleSubtaskId(null);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingTitleSubtaskId(null);
                    }
                  }}
                  className={`font-medium w-full bg-bkg border border-content/20 rounded px-2 py-1 ${subtask.IsCompleted ? 'line-through text-gray-500 dark:text-gray-400' : 'text-content'}`}
                />
              ) : (
                <span
                  className={`font-medium ${subtask.IsCompleted ? 'line-through text-gray-500 dark:text-gray-400' : 'text-content'} ${canEditTitle ? 'cursor-text' : ''}`}
                  onClick={() => {
                    if (!canEditTitle) return;
                    setEditingTitleSubtaskId(subtask.SubtaskID);
                    setEditingTitleValue(subtask.Title || '');
                  }}
                  onDoubleClick={() => {
                    if (!canEditTitle) return;
                    setEditingTitleSubtaskId(subtask.SubtaskID);
                    setEditingTitleValue(subtask.Title || '');
                  }}
                  title={canEditTitle ? 'انقر للتحرير' : undefined}
                >
                  {subtask.Title}
                </span>
              )}
              <span className="text-xs text-content-secondary font-mono ml-2">#{subtask.SubtaskID}</span>
              {canDelete && (
                <button
                  onClick={() => handleDeleteSubtask(subtask)}
                  className="text-red-500 hover:text-red-700 ml-auto"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            
            <div className="flex flex-wrap gap-4 text-xs text-content-secondary">
              <div className="flex items-center gap-2">
                <UserPlus size={14} />
                <select
                  value={subtask.AssignedTo || ''}
                  onChange={(e) => handleAssign(subtask.SubtaskID, e.target.value)}
                  disabled={!canManageAssignments}
                  className="bg-transparent text-xs focus:outline-none disabled:opacity-70 dark:text-gray-300"
                >
                  <option value="">غير مسندة</option>
                  {users.map(user => (
                    <option key={user.UserID} value={user.UserID}>{user.FullName}</option>
                  ))}
                </select>
              </div>
              
              {(subtask.CreatedByName || subtask.CreatedBy) && (
                <div className="flex items-center gap-1">
                  <span>
                    المنشيء: {subtask.CreatedByName || subtask.CreatedBy}
                    {subtask.ActedBy ? ` بواسطة (${subtask.ActedByName || getUserNameById(subtask.ActedBy)})` : ''}
                  </span>
                </div>
              )}
              
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Calendar size={14} />
                  {editingDueSubtaskId === subtask.SubtaskID ? (
                    <input
                      type="date"
                      autoFocus
                      value={editingDueValue}
                      onChange={(e) => setEditingDueValue(e.target.value)}
                      onBlur={async () => {
                        const next = editingDueValue || '';
                        const original = subtask.DueDate ? new Date(subtask.DueDate).toISOString().slice(0, 10) : '';
                        if (next !== original) {
                          await saveSubtaskDetails(subtask.SubtaskID, { DueDate: next || null as any });
                        }
                        setEditingDueSubtaskId(null);
                      }}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const next = editingDueValue || '';
                          const original = subtask.DueDate ? new Date(subtask.DueDate).toISOString().slice(0, 10) : '';
                          if (next !== original) {
                            await saveSubtaskDetails(subtask.SubtaskID, { DueDate: next || null as any });
                          }
                          setEditingDueSubtaskId(null);
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingDueSubtaskId(null);
                        }
                      }}
                      className="text-xs bg-bkg border border-content/20 rounded px-2 py-1 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    />
                  ) : (
                    <span
                      className="cursor-text"
                      onClick={() => {
                        if (!canEditDue) return;
                        setEditingDueSubtaskId(subtask.SubtaskID);
                        const original = subtask.DueDate ? new Date(subtask.DueDate).toISOString().slice(0, 10) : getTodayString();
                        setEditingDueValue(original);
                      }}
                      onDoubleClick={() => {
                        if (!canEditDue) return;
                        setEditingDueSubtaskId(subtask.SubtaskID);
                        const original = subtask.DueDate ? new Date(subtask.DueDate).toISOString().slice(0, 10) : getTodayString();
                        setEditingDueValue(original);
                      }}
                      title={canEditDue ? 'انقر لتعديل تاريخ الاستحقاق' : undefined}
                    >
                      الاستحقاق: {subtask.DueDate ? new Date(subtask.DueDate).toLocaleDateString('ar-EG') : '—'}
                    </span>
                  )}
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!(subtask as any).ShowInCalendar}
                    onChange={(e) => handleToggleCalendar(subtask, e.target.checked)}
                  />
                  <span>إظهار في التقويم</span>
                </label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 mt-2 text-xs text-content-secondary">
            <Clock size={12} />
            <span>
              تم الإنشاء: {new Date(subtask.CreatedAt).toLocaleString('ar-EG', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Muscat'
              })}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderCommentItem = (comment: Comment) => {
    const canManage = comment.UserID === actingUserId || comment.ActedBy === actingUserId;
    const isEditing = editingCommentId === comment.CommentID;
    const handleToggleCommentCalendar = async (next: boolean) => {
      try {
        const resp = await fetch(`/api/comments/${comment.CommentID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            UserID: actingUserId,
            ShowInCalendar: next,
          }),
        });
        if (resp.ok) {
          onCommentsUpdate();
          window.dispatchEvent(new CustomEvent('calendar:comment:updated', { detail: { CommentID: comment.CommentID, ShowInCalendar: next } }));
        }
      } catch (_) {}
    };

    return (
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mt-1">
          <MessageCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-grow">
          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
            {isEditing ? (
              <textarea
                autoFocus
                value={editingCommentValue}
                onChange={(e) => setEditingCommentValue(e.target.value)}
                onBlur={async () => {
                  const trimmed = editingCommentValue.trim();
                  if (trimmed && trimmed !== comment.Content) {
                    await saveComment(comment.CommentID, trimmed);
                  }
                  setEditingCommentId(null);
                }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const trimmed = editingCommentValue.trim();
                    if (trimmed && trimmed !== comment.Content) {
                      await saveComment(comment.CommentID, trimmed);
                    }
                    setEditingCommentId(null);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditingCommentId(null);
                  }
                }}
                className="w-full p-2 border border-content/20 rounded bg-bkg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 text-sm mb-2"
                rows={3}
              />
            ) : (
              <p
                className={`text-content mb-2 break-words whitespace-pre-wrap ${canManage ? 'cursor-text' : ''}`}
                onClick={() => {
                  if (!canManage) return;
                  setEditingCommentId(comment.CommentID);
                  setEditingCommentValue(comment.Content || '');
                }}
                onDoubleClick={() => {
                  if (!canManage) return;
                  setEditingCommentId(comment.CommentID);
                  setEditingCommentValue(comment.Content || '');
                }}
                title={canManage ? 'انقر لتعديل هذا التعليق' : undefined}
              >
                {renderWithLinks(comment.Content)}
              </p>
            )}
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-1">
                <p className="text-xs text-content-secondary">
                  المنشيء: {comment.UserName || comment.UserID}
                  {comment.ActedBy ? ` بواسطة (${comment.ActedByName || getUserNameById(comment.ActedBy)})` : ''}
                </p>
                {canManage && (
                  <label className="flex items-center gap-2 text-xs text-content-secondary">
                    <input
                      type="checkbox"
                      checked={!!comment.ShowInCalendar}
                      onChange={(e) => handleToggleCommentCalendar(e.target.checked)}
                    />
                    <span>إظهار هذا التعليق في التقويم</span>
                  </label>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canManage && (
                  <button
                    onClick={() => handleDeleteComment(comment)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <p className="text-xs text-content-secondary font-mono">#{comment.CommentID}</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 mt-2 text-xs text-content-secondary">
            <Clock size={12} />
            <span>
              تاريخ الإدراج: {new Date(comment.CreatedAt).toLocaleString('ar-EG', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Muscat'
              })}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-8">
      
      {/* نموذج إضافة مهمة فرعية */}
      {canAddSubtasks && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowSubtaskForm(!showSubtaskForm)}
          >
            <h4 className="font-semibold text-content">إضافة مهمة فرعية جديدة</h4>
            <svg 
              className={`w-5 h-5 text-content transition-transform duration-200 ${showSubtaskForm ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          
          {showSubtaskForm && (
          <form onSubmit={handleAddSubtask} className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <div className="md:col-span-3">
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                placeholder="عنوان المهمة الفرعية..."
                required
                className="w-full p-2 border rounded-md bg-bkg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              />
            </div>
            <input
              type="date"
              value={newSubtaskDueDate}
              onChange={(e) => setNewSubtaskDueDate(e.target.value)}
              className="p-2 border rounded-md bg-bkg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
            <select
              value={assignTo}
              onChange={e => setAssignTo(e.target.value)}
              className="p-2 border rounded-md bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            >
              <option value="">إسناد لـ: (نفسي)</option>
              {users.map(user => (
                <option key={user.UserID} value={user.UserID}>{user.FullName}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm px-2">
              <input
                type="checkbox"
                checked={showInCalendar}
                onChange={(e) => setShowInCalendar(e.target.checked)}
              />
              إظهار في التقويم
            </label>
            <button
              type="submit"
              className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-dark"
            >
              إضافة
            </button>
          </form>
          )}
        </div>
      )}
      
      {/* نموذج إضافة تعليق */}
      <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowCommentForm(!showCommentForm)}
        >
          <h4 className="font-semibold text-content">إضافة تعليق جديد</h4>
          <svg 
            className={`w-5 h-5 text-content transition-transform duration-200 ${showCommentForm ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        
        {showCommentForm && (
        <form onSubmit={handleCommentSubmit}>
          <div className="mb-3">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="أضف تعليقاً..."
              rows={3}
              required
              className="w-full p-2 border rounded-md bg-bkg border-content/20 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
          </div>
          
          {/* خيار تحديد التاريخ والوقت المخصص مع زر الإرسال */}
          <div className="flex flex-col md:flex-row gap-3 items-start">
            <div className="flex-1 p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id="useCustomDateTime"
                  checked={useCustomDateTime}
                  onChange={(e) => setUseCustomDateTime(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="useCustomDateTime" className="text-sm font-medium text-content">
                  تحديد تاريخ ووقت مخصص للتعليق
                </label>
              </div>
              
              {useCustomDateTime && (
                <div className="mt-2">
                  <label className="block text-xs text-content-secondary mb-1">
                    التاريخ والوقت (نظام 24 ساعة):
                  </label>
                  <input
                    type="datetime-local"
                    value={customDateTime}
                    onChange={(e) => setCustomDateTime(e.target.value)}
                    className="w-full p-2 border rounded-md bg-bkg border-content/20 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  />
                  <p className="text-xs text-content-secondary mt-1">
                    💡 يمكنك اختيار تاريخ سابق لترتيب التعليقات حسب التسلسل الزمني الصحيح
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2 mt-3">
                <input
                  type="checkbox"
                  id="showCommentInCalendar"
                  checked={showCommentInCalendar}
                  onChange={(e) => setShowCommentInCalendar(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="showCommentInCalendar" className="text-sm font-medium text-content">
                  إظهار هذا التعليق في التقويم
                </label>
              </div>
            </div>
            
            <button
              type="submit"
              disabled={isSubmittingComment}
              className="bg-primary text-white px-6 py-2 rounded-md hover:bg-primary-dark disabled:opacity-50 self-start md:self-center h-fit"
            >
              {isSubmittingComment ? 'جاري الإرسال...' : 'إرسال التعليق'}
            </button>
          </div>
        </form>
        )}
      </div>
      
      {/* الجدول الزمني الموحد */}
      <div className="space-y-6">
        {timelineItems.length > 0 ? (
          timelineItems.map((item) => (
            <div key={item.id} className="relative">
              {item.type === 'subtask'
                ? renderSubtaskItem(item.data as Subtask)
                : renderCommentItem(item.data as Comment)
              }
            </div>
          ))
        ) : (
          <p className="text-center text-content-secondary py-8">
            لا توجد مهام فرعية أو تعليقات بعد.
          </p>
        )}
      </div>
    </div>
  );
};

export default UnifiedTimeline;
