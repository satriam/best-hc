'use client';

import React from 'react';
import { Menu, ShieldCheck, User } from 'lucide-react';

interface HeaderProps {
  userName?: string;
  userRole?: string;
  /** Membuka drawer navigasi (hanya tampil di bawah breakpoint md). */
  onMenuClick?: () => void;
  mobileNavOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  userName = 'Satria',
  userRole = 'USER',
  onMenuClick,
  mobileNavOpen = false,
}) => {
  return (
    <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-20 px-4 md:px-8 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Buka menu navigasi"
          aria-expanded={mobileNavOpen}
          aria-controls={mobileNavOpen ? 'app-sidebar-mobile' : undefined}
          className="md:hidden -ml-2 p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">
          Best HCM System
        </span>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div
          title={`Masuk sebagai ${userName}`}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium"
        >
          {userRole === 'ADMIN' ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>Administrator</span>
            </>
          ) : (
            <>
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Karyawan</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
