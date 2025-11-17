import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface NotificationContextType {
  viewedTasks: Set<number>;
  markTaskAsViewed: (taskId: number) => void;
  isTaskViewed: (taskId: number) => boolean;
  clearViewedTasks: () => void;
  refreshTasks: () => void;
  setRefreshTasks: (refreshFn: () => void) => void;
  refreshNotifications: () => void;
  setRefreshNotifications: (refreshFn: () => void) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [viewedTasks, setViewedTasks] = useState<Set<number>>(new Set());
  const [refreshTasksFn, setRefreshTasksFn] = useState<(() => void) | null>(null);
  const [refreshNotificationsFn, setRefreshNotificationsFn] = useState<(() => void) | null>(null);

  const markTaskAsViewed = (taskId: number) => {
    setViewedTasks(prev => new Set([...prev, taskId]));
  };

  const isTaskViewed = (taskId: number) => {
    return viewedTasks.has(taskId);
  };

  const clearViewedTasks = () => {
    setViewedTasks(new Set());
  };

  const refreshTasks = () => {
    if (refreshTasksFn) {
      refreshTasksFn();
    }
  };

  const setRefreshTasks = (refreshFn: () => void) => {
    setRefreshTasksFn(() => refreshFn);
  };

  const refreshNotifications = () => {
    if (refreshNotificationsFn) {
      refreshNotificationsFn();
    }
  };

  const setRefreshNotifications = (refreshFn: () => void) => {
    setRefreshNotificationsFn(() => refreshFn);
  };

  const value: NotificationContextType = {
    viewedTasks,
    markTaskAsViewed,
    isTaskViewed,
    clearViewedTasks,
    refreshTasks,
    setRefreshTasks,
    refreshNotifications,
    setRefreshNotifications
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};