// src/contexts/ThemeProvider.tsx
import React, { createContext, useContext, useReducer, useEffect } from 'react';

// 1. تعريف الأنواع
type Theme = 'theme-blue' | 'theme-green' | 'theme-purple' | 'theme-orange';
type ThemeMode = 'light' | 'dark';
type State = { theme: Theme; mode: ThemeMode; };
type Action = 
  | { type: 'SET_THEME'; payload: Theme }
  | { type: 'TOGGLE_MODE' };

interface ThemeContextType extends State {
  dispatch: React.Dispatch<Action>;
}

// 2. إعدادات أولية
const initialState: State = {
  theme: (localStorage.getItem('app-theme') as Theme) || 'theme-blue',
  mode: (localStorage.getItem('app-mode') as ThemeMode) || 'light',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// 3. تعريف الـ Reducer لإدارة التغييرات
const themeReducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'TOGGLE_MODE':
      return { ...state, mode: state.mode === 'light' ? 'dark' : 'light' };
    default:
      return state;
  }
};

// 4. بناء الـ Provider
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(themeReducer, initialState);

  useEffect(() => {
    const root = window.document.documentElement;
    root.className = ''; // إزالة كل الكلاسات القديمة
    root.classList.add(state.theme);
    if (state.mode === 'dark') {
      root.classList.add('dark');
    }
    localStorage.setItem('app-theme', state.theme);
    localStorage.setItem('app-mode', state.mode);
  }, [state]);

  return (
    <ThemeContext.Provider value={{ ...state, dispatch }}>
      {children}
    </ThemeContext.Provider>
  );
};

// 5. بناء الهوك للاستخدام
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};