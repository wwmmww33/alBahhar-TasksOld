// src/pages/RegisterPage.tsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

type Department = { DepartmentID: number; Name: string; };

const RegisterPage = () => {
    const [userId, setUserId] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [departmentId, setDepartmentId] = useState('');
    const [departments, setDepartments] = useState<Department[]>([]);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        // جلب قائمة الأقسام ليعرضها في القائمة المنسدلة
        const fetchDepartments = async () => {
            const res = await fetch('/api/departments');
            const data = await res.json();
            setDepartments(data);
        };
        fetchDepartments();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);
        const payload = { userId, password, fullName, departmentId: parseInt(departmentId) };
        
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok) {
            setMessage({ type: 'success', text: data.message });
        } else {
            setMessage({ type: 'error', text: data.message });
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                <h1 className="text-3xl font-bold text-center">إنشاء حساب جديد</h1>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <input type="text" placeholder="اسم المعرف (باللغة الإنجليزية)" value={userId} onChange={e => setUserId(e.target.value)} required className="w-full p-2 border rounded"/>
                    <input type="text" placeholder="الاسم الكامل" value={fullName} onChange={e => setFullName(e.target.value)} required className="w-full p-2 border rounded"/>
                    <input type="password" placeholder="كلمة المرور" value={password} onChange={e => setPassword(e.target.value)} required className="w-full p-2 border rounded"/>
                    <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} required className="w-full p-2 border rounded bg-white">
                        <option value="">-- اختر القسم --</option>
                        {departments.map(dep => <option key={dep.DepartmentID} value={dep.DepartmentID}>{dep.Name}</option>)}
                    </select>
                    <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded-md">إرسال طلب التسجيل</button>
                </form>
                {message && <p className={`text-sm text-center p-2 rounded ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{message.text}</p>}
                <div className="text-center"><Link to="/" className="text-sm text-blue-600 hover:underline">العودة لتسجيل الدخول</Link></div>
            </div>
        </div>
    );
};

export default RegisterPage;