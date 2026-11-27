'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, ShieldCheck, User, LogOut } from 'lucide-react';

interface HeaderProps {
  userName?: string;
  userRole?: string;
  /** Membuka drawer navigasi (hanya tampil di bawah breakpoint md). */
  onMenuClick?: () => void;
  mobileNavOpen?: boolean;
  /** Nama admin asli bila sesi ini sedang "login as user". */
  impersonatedBy?: string;
}

export const Header: React.FC<HeaderProps> = ({
  userName = 'Satria',
  userRole = 'USER',
  onMenuClick,
  mobileNavOpen = false,
  impersonatedBy,
}) => {
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(mobileNavOpen);

  const stopImpersonation = async () => {
    setStopping(true);
    try {
      await fetch('/api/admin/impersonate/stop', { method: 'POST' });
      router.push('/admin/users');
      router.refresh();
    } finally {
      setStopping(false);
    }
  };

  // Kembalikan fokus ke tombol hamburger setelah drawer ditutup.
  useEffect(() => {
    if (wasOpen.current && !mobileNavOpen) {
      menuButtonRef.current?.focus();
    }
    wasOpen.current = mobileNavOpen;
  }, [mobileNavOpen]);

  return (
    <>
      {impersonatedBy && (
        <div className="h-10 bg-amber-500 text-white text-xs sm:text-sm font-medium flex items-center justify-center gap-3 px-4 sticky top-0 z-30">
          <span>
            Login sebagai <strong>{userName}</strong> (oleh admin {impersonatedBy})
          </span>
          <button
            type="button"
            onClick={stopImpersonation}
            disabled={stopping}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors disabled:opacity-60"
          >
            <LogOut className="w-3.5 h-3.5" />
            {stopping ? 'Memproses...' : 'Kembali ke Admin'}
          </button>
        </div>
      )}
      <header className="h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-20 px-4 md:px-8 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button
            type="button"
            ref={menuButtonRef}
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
    </>
  );
};
