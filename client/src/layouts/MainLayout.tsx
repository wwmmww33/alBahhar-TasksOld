// src/layouts/MainLayout.tsx
import React from 'react';
import Navbar from '../components/Navbar';
import SidebarCalendar from '../components/SidebarCalendar';
import type { CurrentUser } from '../types';

type MainLayoutProps = {
  children: React.ReactNode;
  currentUser: CurrentUser;
  onLogout: () => void;
};

const MainLayout = ({ children, currentUser, onLogout }: MainLayoutProps) => {
  return (
    // --- تم نقل كلاسات الثيم إلى هنا ---
    <div className="bg-bkg text-content min-h-screen">
      <Navbar currentUser={currentUser} onLogout={onLogout} />
      <div className="flex">
        <SidebarCalendar currentUser={currentUser} />
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;