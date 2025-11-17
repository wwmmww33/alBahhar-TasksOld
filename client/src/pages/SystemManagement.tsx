// src/pages/SystemManagement.tsx
import { useState } from 'react';
import { Building, Users, UserPlus, UserCheck } from 'lucide-react';
import DepartmentManagement from '../components/DepartmentManagement';
import UserManagement from '../components/UserManagement';
import RegistrationRequests from '../components/RegistrationRequests';
import DelegationManagement from '../components/DelegationManagement';

// تعريف نوع للتبويبات لتنظيم الكود
type AdminTab = 'departments' | 'users' | 'requests' | 'delegations';

const SystemManagement = () => {
  // الحالة الافتراضية الآن هي 'departments'
  const [activeTab, setActiveTab] = useState<AdminTab>('departments');

  // دالة لإنشاء كلاسات الستايل للتبويب
  const getTabClassName = (tabName: AdminTab) => {
    const isActive = activeTab === tabName;
    return `flex items-center gap-2 px-6 py-3 font-semibold border-b-2 transition-colors ${
      isActive
        ? 'border-primary text-primary'
        : 'border-transparent text-content-secondary hover:text-content'
    }`;
  };

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-4xl font-bold mb-8 text-content">إدارة النظام</h1>
      
      {/* شريط التبويبات */}
      <div className="flex border-b border-content/10 mb-8">
        <button 
          onClick={() => setActiveTab('departments')}
          className={getTabClassName('departments')}
        >
          <Building size={20} />
          <span>إدارة الأقسام</span>
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={getTabClassName('users')}
        >
          <Users size={20} />
          <span>إدارة المستخدمين</span>
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={getTabClassName('requests')}
        >
          <UserPlus size={20} />
          <span>طلبات التسجيل</span>
        </button>
        <button
          onClick={() => setActiveTab('delegations')}
          className={getTabClassName('delegations')}
        >
          <UserCheck size={20} />
          <span>إدارة التفويضات</span>
        </button>
      </div>

      {/* محتوى التبويب النشط */}
      <div className="animate-fade-in">
        {activeTab === 'departments' && <DepartmentManagement />}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'requests' && <RegistrationRequests />}
        {activeTab === 'delegations' && <DelegationManagement />}
      </div>
    </div>
  );
};

// لإضافة تأثير بسيط عند ظهور المحتوى
// أضف هذا الكود إلى ملف index.css
/*
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}
*/

export default SystemManagement;