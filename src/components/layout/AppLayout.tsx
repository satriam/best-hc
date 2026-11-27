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
  /** Fitur USER yang aktif; dipakai Sidebar. */
  features?: string[];
  /** Nama admin asli bila sesi ini sedang "login as user". */
  impersonatedBy?: string;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, user, features, impersonatedBy }) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800 font-sans antialiased">
      <Sidebar
        userRole={user.role}
        userName={user.name}
        userEmail={user.email}
        features={features}
        mobileOpen={mobileNavOpen}
        onClose={closeMobileNav}
      />
      <div
        className="flex-1 flex flex-col min-w-0"
        // Saat drawer mobile terbuka, latar dibuat inert agar fokus keyboard
        // terkurung di dalam drawer (tidak ada elemen di belakang yang bisa di-Tab).
        inert={mobileNavOpen || undefined}
      >
        <Header
          userName={user.name}
          userRole={user.role}
          onMenuClick={openMobileNav}
          mobileNavOpen={mobileNavOpen}
          impersonatedBy={impersonatedBy}
        />
        <main className="flex-1 p-4 md:p-8 w-full min-w-0">{children}</main>
      </div>
    </div>
  );
};
