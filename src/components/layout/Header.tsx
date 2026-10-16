'use client';

import React from 'react';
import { Bell, ShieldCheck, User } from 'lucide-react';

interface HeaderProps {
  userName?: string;
  userRole?: string;
}

export const Header: React.FC<HeaderProps> = ({ userName = 'Satria', userRole = 'USER' }) => {
  return (
    <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-20 px-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Best HCM System
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium">
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
