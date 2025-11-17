// src/pages/Dashboard.tsx
import { BarChart, CheckCircle, Clock, Shield, Settings, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react'; // <-- تم الإصلاح هنا
import { Link } from 'react-router-dom';
import type { CurrentUser } from '../types'; // <-- تم الإصلاح هنا

type DashboardProps = { currentUser: CurrentUser; };
type StatCard = { title: string; value: number; icon: LucideIcon; color: string; };

const Dashboard = ({ currentUser }: DashboardProps) => {
  const stats: StatCard[] = [
    { title: 'إجمالي المهام', value: 75, icon: BarChart, color: 'primary' },
    { title: 'مهام مكتملة', value: 50, icon: CheckCircle, color: 'green' },
    { title: 'قيد التنفيذ', value: 20, icon: Clock, color: 'yellow' },
    { title: 'مهام ملغاة', value: 5, icon: XCircle, color: 'red' },
  ];
  
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-content">لوحة التحكم الرئيسية</h1>
        <p className="mt-2 text-content-secondary">مرحباً بك مجدداً، {currentUser.FullName}.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.title} className="bg-content/5 p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-content-secondary">{stat.title}</p>
                <p className="text-3xl font-bold text-content">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {currentUser.IsAdmin && (
        <Link to="/system-management" className="block bg-red-500/10 border-2 border-red-500/30 rounded-lg p-6 cursor-pointer hover:bg-red-500/20 transition-colors">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-2"><Shield className="w-10 h-10 text-red-500" /><Settings className="w-8 h-8 text-red-400 self-end" /></div>
            <div>
              <h3 className="text-xl font-bold text-red-500">إدارة النظام</h3>
              <p className="text-sm text-red-500/80 mt-1">التحكم الكامل في الأقسام، المستخدمين، والصلاحيات.</p>
            </div>
          </div>
        </Link>
      )}
    </div>
  );
};
export default Dashboard;