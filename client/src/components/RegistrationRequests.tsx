// src/components/RegistrationRequests.tsx
import { useState, useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';

type Request = { RequestID: number; UserID: string; FullName: string; DepartmentName: string; };

const RegistrationRequests = () => {
  const [requests, setRequests] = useState<Request[]>([]);

  const fetchRequests = useCallback(async () => {
    const res = await fetch('/api/users/requests');
    const data = await res.json();
    setRequests(data);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = async (requestId: number) => {
    await fetch(`/api/users/requests/${requestId}/approve`, { method: 'POST' });
    fetchRequests(); // إعادة تحميل القائمة
  };

  // (يمكن إضافة دالة للرفض لاحقاً)

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
      <h2 className="text-2xl font-semibold mb-4">طلبات التسجيل المعلقة</h2>
      {requests.length === 0 ? (
        <p className="text-content-secondary">لا توجد طلبات تسجيل معلقة حالياً.</p>
      ) : (
        <table className="w-full text-right">
          <thead><tr><th>المعرف</th><th>الاسم الكامل</th><th>القسم</th><th>إجراء</th></tr></thead>
          <tbody>
            {requests.map(req => (
              <tr key={req.RequestID}>
                <td>{req.UserID}</td><td>{req.FullName}</td><td>{req.DepartmentName}</td>
                <td><button onClick={() => handleApprove(req.RequestID)} className="text-green-500"><Check/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default RegistrationRequests;