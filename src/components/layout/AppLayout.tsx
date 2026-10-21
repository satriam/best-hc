'use client';

import React, { useCallback, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface AppLayoutProps {
  children: React.ReactNode;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'USER';
  };
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, user }) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800 font-sans antialiased">
      <Sidebar
        userRole={user.role}
        userName={user.name}
        userEmail={user.email}
        mobileOpen={mobileNavOpen}
        onClose={closeMobileNav}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={user.name}
          userRole={user.role}
          onMenuClick={openMobileNav}
          mobileNavOpen={mobileNavOpen}
        />
        <main className="flex-1 p-4 md:p-8 w-full min-w-0">{children}</main>
      </div>
    </div>
  );
};
