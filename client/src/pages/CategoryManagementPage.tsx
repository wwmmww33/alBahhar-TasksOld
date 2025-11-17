import React from 'react';
import CategoryManagement from '../components/CategoryManagement';
import type { CurrentUser } from '../types';

interface CategoryManagementPageProps {
  currentUser: CurrentUser;
}

const CategoryManagementPage: React.FC<CategoryManagementPageProps> = ({ currentUser }) => {
  return (
    <div className="container mx-auto px-4 py-6">
      <CategoryManagement currentUser={currentUser} />
    </div>
  );
};

export default CategoryManagementPage;