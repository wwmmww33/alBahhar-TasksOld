// src/pages/LoginPage.tsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CurrentUser } from '../types';

type LoginPageProps = {
  onLoginSuccess: (userData: CurrentUser) => void; 
};

const LoginPage = ({ onLoginSuccess }: LoginPageProps) => {
  // --- 1. تم تفريغ القيم الافتراضية ---
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }
      
      onLoginSuccess(data.user);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <h1 className="text-3xl font-bold text-center text-blue-600 dark:text-blue-400">بحار</h1>
        <h2 className="text-xl font-semibold text-center text-gray-700 dark:text-gray-200">تسجيل الدخول</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="userId" className="block text-sm font-medium text-gray-600 dark:text-gray-300">اسم المستخدم</label>
            <input 
              type="text" 
              id="userId" 
              value={userId} 
              onChange={e => setUserId(e.target.value)} 
              required 
              className="w-full p-2 border rounded mt-1 bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          <div>
            <label htmlFor="password"  className="block text-sm font-medium text-gray-600 dark:text-gray-300">كلمة المرور</label>
            <input 
              type="password" 
              id="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              required 
              className="w-full p-2 border rounded mt-1 bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
            />
          </div>
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button type="submit" disabled={isLoading} className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 dark:bg-blue-500 dark:hover:bg-blue-600">
            {isLoading ? 'جاري التحقق...' : 'دخول'}
          </button>
        </form>
        <div className="text-center mt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">ليس لديك حساب؟ <Link to="/register" className="font-semibold text-blue-600 hover:underline dark:text-blue-400">أنشئ حساباً جديداً</Link></p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;