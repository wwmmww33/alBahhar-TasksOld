// src/pages/TaskList.tsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import TaskCard from '../components/TaskCard';
import SearchBar from '../components/SearchBar';
import { useNotification } from '../contexts/NotificationContext';
import type { CurrentUser, Subtask, Comment } from '../types';
import { Loader2, ClipboardCopy, Filter, User, Users, ChevronDown } from 'lucide-react';

type Task = {
  TaskID: number;
  Title: string;
  CreatedBy: string;
  CreatedByName?: string | null;
  AssignedToName: string | null;
  DueDate: string;
  Status: 'open' | 'in-progress' | 'completed' | 'cancelled' | 'external' | 'approved-in-progress';
  Priority: 'normal' | 'urgent' | 'starred';
  subtasks?: Subtask[];
  comments?: Comment[];
  HasAssignmentNotifications?: number;
  HasCommentNotifications?: number;
};

type TaskListProps = { currentUser: CurrentUser; };

const TaskList = ({ currentUser }: TaskListProps) => {
  const { setRefreshTasks } = useNotification();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 1. حالة جديدة للتحكم في نافذة التصدير
  const [exportText, setExportText] = useState<string | null>(null);
  
  // حالة للتحكم في قائمة التصدير المنسدلة
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  // حالة جديدة لاختيار المهام للتصدير
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  
  // 2. حالة جديدة للفلتر
  const [filterMode, setFilterMode] = useState<'all' | 'my-created'>('all');
  
  // 3. حالة جديدة للبحث
  const [searchTerm, setSearchTerm] = useState<string>('');
  // 3.1 إضافة فلتر الأشخاص (اختياري)
  const [assigneeFilterUserId, setAssigneeFilterUserId] = useState<string | null>(null);
  
  // 4. حالة جديدة للتبويبات
  const [activeTab, setActiveTab] = useState<'active' | 'external' | 'approved' | 'completed' | 'actioned'>('active');

  const fetchTasksAndSubtasks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const isAdmin = currentUser.IsAdmin;
      const tasksRes = await fetch(`/api/tasks/with-notifications?userId=${currentUser.UserID}&isAdmin=${isAdmin}`);
      let tasksData: Task[] = [];

      // حرس قوي لتحليل JSON وتوفير سقوط احتياطي مع فحص نوع المحتوى
      const parseJsonSafely = async (res: Response): Promise<any[]> => {
        if (!res || !res.ok) return [];
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) return [];
        try { return await res.json(); } catch { return []; }
      };

      if (!tasksRes.ok) {
        // في حالة فشل المسار مع الإشعارات، جرب المسار الأساسي كحل مؤقت
        console.warn('Tasks API responded non-OK:', tasksRes.status);
        const fallbackRes = await fetch(`/api/tasks?userId=${currentUser.UserID}&isAdmin=${isAdmin}`);
        const fallbackData = await parseJsonSafely(fallbackRes);
        tasksData = Array.isArray(fallbackData) ? fallbackData as Task[] : [];
      } else {
        // عند نجاح الطلب، حاول تحليل JSON بشكل آمن
        const primaryData = await parseJsonSafely(tasksRes);
        if (Array.isArray(primaryData)) {
          tasksData = primaryData as Task[];
        } else {
          console.warn('with-notifications returned non-JSON or invalid; falling back to /api/tasks');
          const fallbackRes = await fetch(`/api/tasks?userId=${currentUser.UserID}&isAdmin=${isAdmin}`);
          const fallbackData = await parseJsonSafely(fallbackRes);
          tasksData = Array.isArray(fallbackData) ? fallbackData as Task[] : [];
        }
      }

      // التأكد من أن tasksData مصفوفة
      if (!Array.isArray(tasksData)) {
        console.error('Tasks data is not an array:', tasksData);
        tasksData = [];
      }

      // جلب المهام الفرعية والتعليقات والأولويات الشخصية بشكل متوازي للمهام غير المكتملة فقط
      const BATCH_SIZE = 6;
      const fetchInBatches = async <T,>(items: Task[], batchSize: number, fn: (task: Task) => Promise<T>): Promise<T[]> => {
        const results: T[] = [];
        for (let i = 0; i < items.length; i += batchSize) {
          const batch = items.slice(i, i + batchSize);
          const batchResults = await Promise.all(batch.map(fn));
          results.push(...batchResults);
        }
        return results;
      };

      const nonCompletedTasks = tasksData.filter(t => t.Status !== 'completed' && t.Status !== 'cancelled');

      // جلب تفاصيل المهام غير المكتملة فقط
      const subtasksResults = await fetchInBatches(nonCompletedTasks, BATCH_SIZE, async (task) =>
        fetch(`/api/tasks/${task.TaskID}/subtasks?userId=${currentUser.UserID}&isAdmin=${currentUser.IsAdmin}`)
          .then(res => res.status === 403 ? [] : res.json())
          .catch(() => [])
      );

      const commentsResults = await fetchInBatches(nonCompletedTasks, BATCH_SIZE, async (task) =>
        fetch(`/api/tasks/${task.TaskID}/comments?userId=${currentUser.UserID}&isAdmin=${currentUser.IsAdmin}`)
          .then(res => res.status === 403 ? [] : res.json())
          .catch(() => [])
      );
      
      const prioritiesResults = await fetchInBatches(nonCompletedTasks, BATCH_SIZE, async (task) =>
        fetch(`/api/tasks/${task.TaskID}/user-priority?userId=${currentUser.UserID}`)
          .then(res => res.json())
          .catch(() => ({ priority: task.Priority }))
      );

      // بناء خريطة تفاصيل حسب المعرف للدمج السهل
      const detailsById: Record<number, { subtasks: Subtask[]; comments: Comment[]; priority: 'normal' | 'urgent' | 'starred'; }> = {};
      nonCompletedTasks.forEach((t, idx) => {
        detailsById[t.TaskID] = {
          subtasks: subtasksResults[idx] || [],
          comments: commentsResults[idx] || [],
          priority: prioritiesResults[idx]?.priority || t.Priority,
        };
      });

      // دمج البيانات: إبقاء المهام المكتملة بدون تفاصيل حتى يُفتح تبويبها
      tasksData = tasksData.map(task => {
        const det = detailsById[task.TaskID];
        return {
          ...task,
          subtasks: det ? det.subtasks : [],
          comments: det ? det.comments : [],
          Priority: det ? det.priority : task.Priority,
          HasCommentNotifications: typeof task.HasCommentNotifications === 'number' ? task.HasCommentNotifications : 0
        };
      });

      setTasks(tasksData);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError('فشل في تحميل المهام');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.UserID, currentUser.IsAdmin]);

  useEffect(() => {
    fetchTasksAndSubtasks();
    
    // تسجيل دالة تحديث المهام في NotificationContext
    setRefreshTasks(fetchTasksAndSubtasks);
    
    // تم تعطيل تحديث قائمة المهام عند عودة التركيز إلى النافذة
  }, [fetchTasksAndSubtasks, setRefreshTasks]);

  // حالة تتبع جلب تفاصيل المهام المكتملة عند طلبها
  const [completedDetailsFetched, setCompletedDetailsFetched] = useState(false);

  // جلب تفاصيل المهام المكتملة عند فتح تبويبها لأول مرة
  useEffect(() => {
    const fetchCompletedDetails = async () => {
      try {
        const completedTasksOnly = tasks.filter(t => t.Status === 'completed' || t.Status === 'cancelled');
        if (completedTasksOnly.length === 0) {
          setCompletedDetailsFetched(true);
          return;
        }
        const BATCH_SIZE = 6;
        const fetchInBatches = async <T,>(items: Task[], batchSize: number, fn: (task: Task) => Promise<T>): Promise<T[]> => {
          const results: T[] = [];
          for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await Promise.all(batch.map(fn));
            results.push(...batchResults);
          }
          return results;
        };

        const completedSubtasks = await fetchInBatches(completedTasksOnly, BATCH_SIZE, async (task) =>
          fetch(`/api/tasks/${task.TaskID}/subtasks?userId=${currentUser.UserID}&isAdmin=${currentUser.IsAdmin}`)
            .then(res => res.status === 403 ? [] : res.json())
            .catch(() => [])
        );

        const completedComments = await fetchInBatches(completedTasksOnly, BATCH_SIZE, async (task) =>
          fetch(`/api/tasks/${task.TaskID}/comments?userId=${currentUser.UserID}&isAdmin=${currentUser.IsAdmin}`)
            .then(res => res.status === 403 ? [] : res.json())
            .catch(() => [])
        );

        const completedPriorities = await fetchInBatches(completedTasksOnly, BATCH_SIZE, async (task) =>
          fetch(`/api/tasks/${task.TaskID}/user-priority?userId=${currentUser.UserID}`)
            .then(res => res.json())
            .catch(() => ({ priority: task.Priority }))
        );

        // دمج التفاصيل في الحالة الحالية
        setTasks(prev => {
          const byId: Record<number, { subtasks: Subtask[]; comments: Comment[]; priority: 'normal' | 'urgent' | 'starred'; }> = {};
          completedTasksOnly.forEach((t, idx) => {
            byId[t.TaskID] = {
              subtasks: completedSubtasks[idx] || [],
              comments: completedComments[idx] || [],
              priority: completedPriorities[idx]?.priority || t.Priority,
            };
          });
          return prev.map(t => {
            const det = byId[t.TaskID];
            if (!det) return t;
            return { ...t, subtasks: det.subtasks, comments: det.comments, Priority: det.priority };
          });
        });

        setCompletedDetailsFetched(true);
      } catch (e) {
        // في حالة الخطأ، لا نمنع الصفحة من العمل؛ فقط نُبقي التفاصيل فارغة
        console.error('Error fetching completed task details:', e);
      }
    };

    if (activeTab === 'completed' && !completedDetailsFetched) {
      fetchCompletedDetails();
    }
  }, [activeTab, completedDetailsFetched, tasks, currentUser.UserID, currentUser.IsAdmin]);

  // دالة لتحديث أولوية المهمة
  const updateTaskPriority = async (taskId: number, newPriority: 'normal' | 'urgent' | 'starred') => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/user-priority?userId=${currentUser.UserID}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priority: newPriority
        }),
      });

      if (response.ok) {
        // تحديث الحالة المحلية
        setTasks(prevTasks => 
          prevTasks.map(task => 
            task.TaskID === taskId 
              ? { ...task, Priority: newPriority }
              : task
          )
        );
      } else {
        console.error('Failed to update task priority');
      }
    } catch (error) {
      console.error('Error updating task priority:', error);
    }
  };

  // 4. دالة لتصدير المهام (محسنة)
  const handleExport = (tasksToExport: Task[], title: string) => {
    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB'); // التاريخ الميلادي
    };

    let exportContent = `=== ${title} ===\n`;
    exportContent += `تاريخ التصدير: ${new Date().toLocaleDateString('en-GB')}\n`;
    exportContent += `عدد المهام: ${tasksToExport.length}\n\n`;

    tasksToExport.forEach((task, index) => {
      exportContent += `${index + 1}. ${task.Title}\n`;
      exportContent += `   📅 تاريخ الاستحقاق: ${formatDate(task.DueDate)}\n`;
      
      // المهام الفرعية
      if (task.subtasks && task.subtasks.length > 0) {
        exportContent += `   📋 المهام الفرعية (${task.subtasks.length}):\n`;
        task.subtasks.forEach((subtask, subIndex) => {
          const statusIcon = subtask.IsCompleted ? '✅' : '⏳';
          exportContent += `      ${subIndex + 1}. ${statusIcon} ${subtask.Title}\n`;
        });
      }
      
      // التعليقات
      if (task.comments && task.comments.length > 0) {
        exportContent += `   💬 التعليقات (${task.comments.length}):\n`;
        task.comments.forEach((comment, commentIndex) => {
          const commentDate = new Date(comment.CreatedAt).toLocaleDateString('en-GB');
          exportContent += `      ${commentIndex + 1}. ${comment.Content} - (${comment.UserName || comment.UserID}, ${commentDate})\n`;
        });
      }
      
      exportContent += `\n`;
    });

    setExportText(exportContent);
    setShowExportMenu(false);
  };

  // دوال التصدير المختلفة
  const handleExportAll = () => handleExport(tasks, 'جميع المهام');
  const handleExportUrgent = () => {
    const urgentTasks = tasks.filter(task => task.Priority === 'urgent');
    handleExport(urgentTasks, 'المهام العاجلة');
  };
  
  // دالة تصدير المهام المختارة
  const handleExportSelected = () => {
    const selectedTasksList = tasks.filter(task => selectedTasks.has(task.TaskID));
    handleExport(selectedTasksList, 'المهام المختارة');
    setIsSelectionMode(false);
    setSelectedTasks(new Set());
  };
  
  // دوال التعامل مع اختيار المهام
  const toggleTaskSelection = (taskId: number) => {
    const newSelected = new Set(selectedTasks);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTasks(newSelected);
  };
  
  const selectAllTasks = () => {
    const currentTabTasks = getCurrentTabTasks();
    const allTaskIds = new Set(currentTabTasks.map(task => task.TaskID));
    setSelectedTasks(allTaskIds);
  };
  
  const clearSelection = () => {
    setSelectedTasks(new Set());
  };
  
  // دالة للحصول على مهام التبويب الحالي
  const getCurrentTabTasks = () => {
    switch (activeTab) {
      case 'active': return activeTasks;
      case 'external': return externalTasks;
      case 'approved': return approvedTasks;
      case 'completed': return completedTasks;
      case 'actioned': return actionedTasks;
      default: return activeTasks;
    }
  };

  // دالة نسخ النص إلى الحافظة
  const copyToClipboard = async () => {
    if (exportText) {
      try {
        await navigator.clipboard.writeText(exportText);
        setExportText(null);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  };

  // 5. فلترة المهام حسب الوضع المحدد والبحث
  // بناء قائمة الأشخاص المتاحين من المهام الفرعية الموجودة حالياً
  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string | undefined>();
    tasks.forEach(task => {
      (task.subtasks || []).forEach(st => {
        if (st.AssignedTo) {
          // استخدام الاسم إن وجد، وإلا نبقي المعرف فقط
          map.set(st.AssignedTo, (st as any).AssignedToName);
        }
      });
    });
    // ترتيب أبجدي حسب الاسم إن وجد، وإلا حسب المعرف
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name: name || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const filteredTasks = tasks.filter(task => {
    // فلتر حسب المنشئ
    const matchesFilter = filterMode === 'all' || task.CreatedBy === currentUser.UserID;
    
    // فلتر حسب البحث
    const matchesSearch = !searchTerm.trim() || 
      task.Title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (task.CreatedByName && task.CreatedByName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (task.AssignedToName && task.AssignedToName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      // البحث في المهام الفرعية
      (task.subtasks && task.subtasks.some(subtask => 
        subtask.Title.toLowerCase().includes(searchTerm.toLowerCase())
      )) ||
      // البحث في التعليقات
      (task.comments && task.comments.some(comment => 
        comment.Content.toLowerCase().includes(searchTerm.toLowerCase())
      ));

    // فلتر حسب الشخص المختار: عند اختيار شخص معيّن، نعرض فقط المهام التي تحتوي
    // على مهام فرعية غير مكتملة مسندة له، ونستبعد المهام التي لا تحتوي على مهام فرعية إطلاقاً
    const matchesAssignee = !assigneeFilterUserId
      ? true
      : !!(task.subtasks && task.subtasks.length > 0 &&
           task.subtasks.some(st => !st.IsCompleted && st.AssignedTo === assigneeFilterUserId));
    
    return matchesFilter && matchesSearch && matchesAssignee;
  });



  const activeTasks = filteredTasks.filter(task => {
    // استبعاد المهام المكتملة والملغاة والخارجية والمعتمدة
    if (
      task.Status === 'completed' ||
      task.Status === 'cancelled' ||
      task.Status === 'external' ||
      task.Status === 'approved-in-progress'
    ) {
      return false;
    }

    // إذا لم تكن هناك مهام فرعية إطلاقاً، اعرض المهمة إذا كنتَ أنت المنشئ
    if (!task.subtasks || task.subtasks.length === 0) {
      return task.CreatedBy === currentUser.UserID;
    }

    // إظهار فقط المهام التي لدي فيها إجراء (مهام فرعية مسندة لي)
    const mySubtasks = (task.subtasks || []).filter(
      subtask => subtask.AssignedTo === currentUser.UserID
    );
    if (mySubtasks.length === 0) {
      return false; // لا توجد مهام فرعية مسندة لي، ليست ضمن المهام النشطة الخاصة بي
    }

    // استبعاد المهام التي أنجزت جميع إجراءاتي فيها
    if (mySubtasks.every(subtask => subtask.IsCompleted)) {
      return false;
    }

    return true;
  });
  const completedTasks = filteredTasks.filter(task => task.Status === 'completed' || task.Status === 'cancelled');
  const externalTasks = filteredTasks.filter(task => task.Status === 'external');
  const approvedTasks = filteredTasks.filter(task => task.Status === 'approved-in-progress');
  
  // المهام التي أنجزت إجرائي فيها:
  // - إما أكملت كل المهام الفرعية المسندة إليّ
  // - أو أنني منشئ المهمة وليس لدي مهام فرعية مسندة لي، لكن توجد مهام فرعية مسندة لآخرين
  const actionedTasks = filteredTasks.filter(task => {
    // استبعاد المهام المكتملة أو الملغاة أو المسندة للجهات الخارجية أو المعتمدة قيد التنفيذ
    if (
      task.Status === 'completed' ||
      task.Status === 'cancelled' ||
      task.Status === 'external' ||
      task.Status === 'approved-in-progress'
    ) {
      return false;
    }

    if (!task.subtasks || task.subtasks.length === 0) {
      return false; // لا توجد مهام فرعية
    }

    const mySubtasks = task.subtasks.filter(
      subtask => subtask.AssignedTo === currentUser.UserID
    );
    const otherAssignedSubtasks = task.subtasks.filter(
      subtask => subtask.AssignedTo && subtask.AssignedTo !== currentUser.UserID
    );

    const hasActionedByCompletion =
      mySubtasks.length > 0 && mySubtasks.every(subtask => subtask.IsCompleted);
    const hasActionedByDelegation =
      mySubtasks.length === 0 &&
      otherAssignedSubtasks.length > 0 &&
      task.CreatedBy === currentUser.UserID;

    return hasActionedByCompletion || hasActionedByDelegation;
  });

  // دالة للحصول على أكبر معرف للمهام الفرعية الغير مكتملة
  const getMaxIncompleteSubtaskId = (task: Task): number => {
    if (!task.subtasks || task.subtasks.length === 0) {
      return 0; // إذا لم توجد مهام فرعية، استخدم 0
    }
    
    // فلترة المهام الفرعية الغير مكتملة
    const myIncompleteSubtasks = task.subtasks.filter(
      st => !st.IsCompleted && st.AssignedTo === currentUser.UserID
    ) || [];
    
    if (myIncompleteSubtasks.length === 0) {
      return 0; // إذا لم توجد مهام فرعية غير مكتملة، استخدم 0
    }
    
    // العثور على أكبر معرف من المهام الفرعية الغير مكتملة
    return Math.max(...myIncompleteSubtasks.map(st => st.SubtaskID));
  };

  // دالة لحساب الإشعارات لكل تبويب
  const getTabNotifications = (tasks: Task[]) => {
    return tasks.reduce((acc, task) => {
      // حساب إشعارات الإسناد والتعليقات
      const hasAssignmentNotifications = task.HasAssignmentNotifications && task.HasAssignmentNotifications > 0;
      const hasCommentNotifications = task.HasCommentNotifications && task.HasCommentNotifications > 0;
      
      if (hasAssignmentNotifications) {
        acc.assignment += 1;
      }
      if (hasCommentNotifications) {
        acc.comment += 1;
      }
      
      return acc;
    }, { assignment: 0, comment: 0 });
  };

  // حساب الإشعارات لكل تبويب
  const activeTabNotifications = getTabNotifications(activeTasks);
  const actionedTabNotifications = getTabNotifications(actionedTasks);
  const externalTabNotifications = getTabNotifications(externalTasks);
  const approvedTabNotifications = getTabNotifications(approvedTasks);
  const completedTabNotifications = getTabNotifications(completedTasks);

  // حساب إجمالي الإشعارات لكل تبويب

  // ترتيب المهام: المهام العاجلة أولاً، ثم حسب أكبر معرف للمهام الفرعية الغير مكتملة
  const sortTasks = (tasks: Task[]) => {
    return tasks.sort((a, b) => {
      // أولوية للمهام العاجلة
      if (a.Priority === 'urgent' && b.Priority !== 'urgent') return -1;
      if (b.Priority === 'urgent' && a.Priority !== 'urgent') return 1;
      
      // إذا كانت كلاهما عاجلة أو كلاهما عادية، رتب حسب أكبر معرف للمهام الفرعية
      const maxIdA = getMaxIncompleteSubtaskId(a);
      const maxIdB = getMaxIncompleteSubtaskId(b);
      return maxIdB - maxIdA; // ترتيب تنازلي (الأكبر أولاً)
    });
  };
  
  sortTasks(activeTasks);
  sortTasks(actionedTasks);
  sortTasks(completedTasks);
  sortTasks(externalTasks);
  sortTasks(approvedTasks);

  if (isLoading) return <div className="flex justify-center items-center p-8"><Loader2 className="animate-spin text-primary" size={48} /></div>;
  if (error) return <p className="text-center p-8 text-red-500">حدث خطأ: {error}</p>;

  return (
    <div className="space-y-12 relative">
      {/* --- البحث والفلتر والتصدير --- */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border p-4 mb-6">
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
          {/* مكون البحث */}
          <div className="flex items-center gap-4 flex-1">
            <SearchBar 
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              placeholder="البحث في المهام والمهام الفرعية والتعليقات..."
            />
          </div>
          
          {/* فلتر المهام */}
      <div className="flex items-center gap-4">
        <Filter className="text-primary" size={20} />
        <span className="font-medium text-content">عرض المهام:</span>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterMode('all')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              filterMode === 'all'
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-content hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <Users size={16} />
            جميع المهام
          </button>
          <button
            onClick={() => setFilterMode('my-created')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
              filterMode === 'my-created'
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-content hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <User size={16} />
            المهام التي أنشأتها
          </button>
        </div>
      </div>

      {/* فلتر أسماء الأشخاص */}
      <div className="flex items-center gap-2">
        <span className="font-medium text-content">حسب الشخص:</span>
        <select
          value={assigneeFilterUserId ?? ''}
          onChange={(e) => {
            const val = e.target.value;
            setAssigneeFilterUserId(val ? val : null);
          }}
          className="px-3 py-2 rounded-md bg-gray-100 dark:bg-gray-700 text-content hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          <option value="">جميع الأشخاص</option>
          {assigneeOptions.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
        {assigneeFilterUserId && (
          <button
            onClick={() => setAssigneeFilterUserId(null)}
            className="px-2 py-1 text-sm rounded-md bg-gray-200 dark:bg-gray-600"
          >
            مسح الفلتر
          </button>
        )}
      </div>
          
          {/* أزرار التحكم في الاختيار */}
          {isSelectionMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllTasks}
                className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
              >
                اختيار الكل
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-sm"
              >
                إلغاء الاختيار
              </button>
              <button
                onClick={() => {
                  setIsSelectionMode(false);
                  setSelectedTasks(new Set());
                }}
                className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
              >
                إنهاء الاختيار
              </button>
              {selectedTasks.size > 0 && (
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  تم اختيار {selectedTasks.size} مهمة
                </span>
              )}
            </div>
          )}
          
          {/* زر التصدير */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors"
            >
              <ClipboardCopy size={16} />
              <span>تصدير</span>
              <ChevronDown size={16} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border z-10">
                <button
                  onClick={handleExportAll}
                  className="w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  📋 جميع المهام
                </button>
                <button
                  onClick={handleExportUrgent}
                  className="w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  🔴 المهام العاجلة فقط
                </button>
                <button
                  onClick={() => handleExport(activeTasks, 'المهام النشطة')}
                  className="w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  ⚡ المهام النشطة
                </button>
                <button
                  onClick={() => handleExport(completedTasks, 'المهام المكتملة')}
                  className="w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  ✅ المهام المكتملة
                </button>
                <button
                  onClick={() => handleExport(externalTasks, 'المهام الخارجية')}
                  className="w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  🏢 المهام الخارجية
                </button>
                <button
                  onClick={() => handleExport(approvedTasks, 'المهام المعتمدة')}
                  className="w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  ✅⚡ المهام المعتمدة
                </button>
                <button
                  onClick={() => handleExport(actionedTasks, 'المهام المنجزة إجرائياً')}
                  className="w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  ✅📋 المهام المنجزة إجرائياً
                </button>
                <hr className="my-1" />
                <button
                  onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    setShowExportMenu(false);
                  }}
                  className="w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors font-medium"
                >
                  🎯 اختيار مهام محددة
                </button>
                {selectedTasks.size > 0 && (
                  <button
                    onClick={handleExportSelected}
                    className="w-full text-right px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-blue-600 font-medium"
                  >
                    📤 تصدير المهام المختارة ({selectedTasks.size})
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- 3. كود النافذة المنبثقة (Modal) --- */}
      {exportText && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setExportText(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-content mb-4">تقرير المهام (جاهز للنسخ)</h2>
            <textarea
              readOnly
              value={exportText}
              className="w-full h-64 p-2 border rounded bg-gray-50 dark:bg-gray-700 font-mono text-sm"
              onFocus={(e) => e.target.select()}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={copyToClipboard} className="bg-primary text-white px-4 py-2 rounded-md hover:bg-primary-dark">
                نسخ وإغلاق
              </button>
              <button onClick={() => setExportText(null)} className="bg-gray-200 dark:bg-gray-600 px-4 py-2 rounded-md">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}



      {/* --- نظام التبويبات --- */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border mb-6">
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'active'
                ? 'text-primary border-b-2 border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-600 dark:text-gray-400 hover:text-primary'
            }`}
          >
            ⚡ المهام النشطة ({activeTasks.length})
            <div className="flex items-center gap-1 ml-2">
              {activeTabNotifications.assignment > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                  {activeTabNotifications.assignment}
                </span>
              )}
              {activeTabNotifications.comment > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-green-500 rounded-full animate-pulse">
                  {activeTabNotifications.comment}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('actioned')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'actioned'
                ? 'text-primary border-b-2 border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-600 dark:text-gray-400 hover:text-primary'
            }`}
          >
            🔧 المهام التي أنجزت إجرائي فيها ({actionedTasks.length})
            <div className="flex items-center gap-1 ml-2">
              {actionedTabNotifications.assignment > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                  {actionedTabNotifications.assignment}
                </span>
              )}
              {actionedTabNotifications.comment > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-green-500 rounded-full animate-pulse">
                  {actionedTabNotifications.comment}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('external')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'external'
                ? 'text-primary border-b-2 border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-600 dark:text-gray-400 hover:text-primary'
            }`}
          >
            🏢 المهام الخارجية ({externalTasks.length})
            <div className="flex items-center gap-1 ml-2">
              {externalTabNotifications.assignment > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                  {externalTabNotifications.assignment}
                </span>
              )}
              {externalTabNotifications.comment > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-green-500 rounded-full animate-pulse">
                  {externalTabNotifications.comment}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'approved'
                ? 'text-primary border-b-2 border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-600 dark:text-gray-400 hover:text-primary'
            }`}
          >
            ✅⚡ المهام المعتمدة ({approvedTasks.length})
            <div className="flex items-center gap-1 ml-2">
              {approvedTabNotifications.assignment > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                  {approvedTabNotifications.assignment}
                </span>
              )}
              {approvedTabNotifications.comment > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-green-500 rounded-full animate-pulse">
                  {approvedTabNotifications.comment}
                </span>
              )}
            </div>
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'completed'
                ? 'text-primary border-b-2 border-primary bg-blue-50 dark:bg-blue-900/20'
                : 'text-gray-600 dark:text-gray-400 hover:text-primary'
            }`}
          >
            ✅ المهام المكتملة ({completedTasks.length})
            <div className="flex items-center gap-1 ml-2">
              {completedTabNotifications.assignment > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                  {completedTabNotifications.assignment}
                </span>
              )}
              {completedTabNotifications.comment > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-green-500 rounded-full animate-pulse">
                  {completedTabNotifications.comment}
                </span>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* --- عرض المهام حسب التبويب النشط --- */}
      {activeTab === 'active' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-content border-b-2 border-primary pb-2">المهام النشطة</h1>
              {searchTerm.trim() && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  عُثر على {activeTasks.length} مهمة نشطة تطابق البحث
                </p>
              )}
            </div>
          </div>
          {activeTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeTasks.map(task => (
                <TaskCard 
                  key={task.TaskID} 
                  task={task} 
                  onPriorityChange={updateTaskPriority}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedTasks.has(task.TaskID)}
                  onToggleSelection={toggleTaskSelection}
                />
              ))}
            </div>
          ) : (
            <p className="text-content-secondary text-center py-4">
              {searchTerm.trim() 
                ? `لم يتم العثور على مهام نشطة تطابق البحث "${searchTerm}"`
                : "لا توجد مهام نشطة حالياً. عمل رائع!"
              }
            </p>
          )}
        </div>
      )}

      {activeTab === 'external' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-content border-b-2 border-orange-500 pb-2">المهام الخارجية</h1>
              {searchTerm.trim() && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  عُثر على {externalTasks.length} مهمة خارجية تطابق البحث
                </p>
              )}
            </div>
          </div>
          {externalTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {externalTasks.map(task => (
                <TaskCard 
                  key={task.TaskID} 
                  task={task} 
                  onPriorityChange={updateTaskPriority}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedTasks.has(task.TaskID)}
                  onToggleSelection={toggleTaskSelection}
                />
              ))}
            </div>
          ) : (
            <p className="text-content-secondary text-center py-4">
              {searchTerm.trim() 
                ? `لم يتم العثور على مهام خارجية تطابق البحث "${searchTerm}"`
                : "لا توجد مهام مسندة لجهات خارجية حالياً."
              }
            </p>
          )}
        </div>
      )}

      {activeTab === 'approved' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-content border-b-2 border-emerald-500 pb-2">المهام المعتمدة</h1>
              {searchTerm.trim() && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  عُثر على {approvedTasks.length} مهمة معتمدة تطابق البحث
                </p>
              )}
            </div>
          </div>
          {approvedTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {approvedTasks.map(task => (
                <TaskCard 
                  key={task.TaskID} 
                  task={task} 
                  onPriorityChange={updateTaskPriority}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedTasks.has(task.TaskID)}
                  onToggleSelection={toggleTaskSelection}
                />
              ))}
            </div>
          ) : (
            <p className="text-content-secondary text-center py-4">
              {searchTerm.trim() 
                ? `لم يتم العثور على مهام معتمدة تطابق البحث "${searchTerm}"`
                : "لا توجد مهام معتمدة حالياً."
              }
            </p>
          )}
        </div>
      )}

      {activeTab === 'actioned' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-content border-b-2 border-orange-500 pb-2">تم اتخاذ الاجراء فيها</h1>
              {searchTerm.trim() && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  عُثر على {actionedTasks.length} مهمة تم اتخاذ إجراء فيها تطابق البحث
                </p>
              )}
            </div>
          </div>
          {actionedTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {actionedTasks.map(task => (
                <TaskCard 
                  key={task.TaskID} 
                  task={task} 
                  onPriorityChange={updateTaskPriority}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedTasks.has(task.TaskID)}
                  onToggleSelection={toggleTaskSelection}
                />
              ))}
            </div>
          ) : (
            <p className="text-content-secondary text-center py-4">
              {searchTerm.trim() 
                ? `لم يتم العثور على مهام تم اتخاذ إجراء فيها تطابق البحث "${searchTerm}"`
                : "لا توجد مهام تم اتخاذ إجراء فيها حالياً."
              }
            </p>
          )}
        </div>
      )}

      {activeTab === 'completed' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-content-secondary border-b-2 border-green-500 pb-2">المهام المكتملة</h1>
              {searchTerm.trim() && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  عُثر على {completedTasks.length} مهمة مكتملة تطابق البحث
                </p>
              )}
            </div>
          </div>
          {completedTasks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 opacity-80">
              {completedTasks.map(task => (
                <TaskCard 
                  key={task.TaskID} 
                  task={task} 
                  onPriorityChange={updateTaskPriority}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedTasks.has(task.TaskID)}
                  onToggleSelection={toggleTaskSelection}
                />
              ))}
            </div>
          ) : (
            <p className="text-content-secondary text-center py-4">
              {searchTerm.trim() 
                ? `لم يتم العثور على مهام مكتملة تطابق البحث "${searchTerm}"`
                : "لا توجد مهام مكتملة بعد."
              }
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TaskList;

// جلب المهام الفرعية والتعليقات لكل مهمة لكن مع تحديد حد أقصى للتوازي (BATCH_SIZE) للحد من العواصف وتقليل أخطاء net::ERR_INSUFFICIENT_RESOURCES. كذلك تطبيق نفس النهج على جلب المهام الفرعية والتعليقات والأولوية.