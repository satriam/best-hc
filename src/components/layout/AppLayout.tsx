'use client';

import React from 'react';
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
  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800 font-sans antialiased">
      <Sidebar userRole={user.role} userName={user.name} userEmail={user.email} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header userName={user.name} userRole={user.role} />
        <main className="flex-1 p-6 md:p-8 w-full min-w-0">{children}</main>
      </div>
    </div>
  );
};
