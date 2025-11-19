// src/pages/DelegationsPage.tsx
import React from 'react';
import DelegationManagement from '../components/DelegationManagement';

const DelegationsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-content">إدارة التفويضات</h2>
      </div>
      <DelegationManagement />
    </div>
  );
};

export default DelegationsPage;