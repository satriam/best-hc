'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarPlus,
  History,
  User,
  Layers,
  Users,
  Building2,
  LogOut,
  ChevronRight,
  PieChart,
  CalendarDays,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  userRole?: 'ADMIN' | 'USER';
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
  /** Drawer hanya aktif di bawah breakpoint md. */
  mobileOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  userRole = 'USER',
  userName = 'User',
  userEmail = '',
  onLogout,
  mobileOpen = false,
  onClose,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  // Drawer mobile: Esc untuk menutup, kunci scroll body, dan fokus ke tombol tutup.
  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen, onClose]);

  return (
    <>
      {/* Sidebar desktop (>= md) — sticky seperti sebelumnya */}
      <aside
        id="app-sidebar-desktop"
        aria-label="Navigasi utama"
        className="hidden md:flex w-64 bg-slate-900 text-slate-300 flex-col h-screen sticky top-0 border-r border-slate-800 select-none z-30"
      >
        <SidebarContent
          userRole={userRole}
          userName={userName}
          userEmail={userEmail}
          onLogout={onLogout}
        />
      </aside>

      {/* Drawer mobile (< md) — hanya dirender saat terbuka agar tidak ada fokus di luar layar */}
      {mobileOpen && (
        <div className="md:hidden">
          <div
            aria-hidden="true"
            onClick={handleClose}
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm animate-[backdrop-in_150ms_ease-out]"
          />
          <aside
            id="app-sidebar-mobile"
            role="dialog"
            aria-modal="true"
            aria-label="Navigasi utama"
            className="fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] bg-slate-900 text-slate-300 flex flex-col h-full border-r border-slate-800 select-none shadow-2xl shadow-slate-950/50 animate-[drawer-in_200ms_ease-out]"
          >
            <SidebarContent
              userRole={userRole}
              userName={userName}
              userEmail={userEmail}
              onLogout={onLogout}
              onNavigate={handleClose}
              headerAction={
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={handleClose}
                  aria-label="Tutup menu navigasi"
                  className="ml-auto -mr-2 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              }
            />
          </aside>
        </div>
      )}
    </>
  );
};

interface SidebarContentProps {
  userRole: 'ADMIN' | 'USER';
  userName: string;
  userEmail: string;
  onLogout?: () => void;
  /** Dipanggil setelah item navigasi diklik (untuk menutup drawer). */
  onNavigate?: () => void;
  headerAction?: React.ReactNode;
}

const SidebarContent: React.FC<SidebarContentProps> = ({
  userRole,
  userName,
  userEmail,
  onLogout,
  onNavigate,
  headerAction,
}) => {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    onNavigate?.();
    if (onLogout) {
      onLogout();
    } else {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    }
  };

  const isUser = userRole === 'USER';

  return (
    <>
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800/80 bg-slate-950/40 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-900/50">
          <Building2 className="w-5 h-5 stroke-[2.2]" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
            Best HCM
          </h1>
          <p className="text-[10px] uppercase font-semibold tracking-wider text-indigo-400">
            {userRole === 'ADMIN' ? 'Admin Portal' : 'Employee Portal'}
          </p>
        </div>
        {headerAction}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto custom-scrollbar">
        {isUser ? (
          /* USER NAVIGATION */
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Utama
            </p>
            <NavItem
              href="/dashboard"
              icon={<LayoutDashboard className="w-4 h-4" />}
              label="Dashboard"
              active={pathname === '/dashboard'}
              onNavigate={onNavigate}
            />
            <NavItem
              href="/leave-requests/create"
              icon={<CalendarPlus className="w-4 h-4" />}
              label="Pengajuan Cuti"
              active={pathname === '/leave-requests/create'}
              onNavigate={onNavigate}
            />
            <NavItem
              href="/leave-requests"
              icon={<History className="w-4 h-4" />}
              label="Riwayat Cuti"
              active={pathname === '/leave-requests'}
              onNavigate={onNavigate}
            />
            <NavItem
              href="/profile"
              icon={<User className="w-4 h-4" />}
              label="Profil"
              active={pathname === '/profile'}
              onNavigate={onNavigate}
            />
          </div>
        ) : (
          /* ADMIN NAVIGATION */
          <>
            <div className="space-y-1">
              <p className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Utama
              </p>
              <NavItem
                href="/admin/dashboard"
                icon={<LayoutDashboard className="w-4 h-4" />}
                label="Dashboard"
                active={pathname === '/admin/dashboard'}
                onNavigate={onNavigate}
              />
            </div>

            <div className="space-y-1">
              <p className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Manajemen Cuti
              </p>
              <NavItem
                href="/admin/leave-requests"
                icon={<CalendarPlus className="w-4 h-4" />}
                label="Pengajuan Cuti"
                active={pathname === '/admin/leave-requests'}
                onNavigate={onNavigate}
              />
              <NavItem
                href="/admin/leave-types"
                icon={<Layers className="w-4 h-4" />}
                label="Jenis Cuti"
                active={pathname === '/admin/leave-types'}
                onNavigate={onNavigate}
              />
              <NavItem
                href="/admin/holidays"
                icon={<CalendarDays className="w-4 h-4" />}
                label="Hari Libur"
                active={pathname === '/admin/holidays'}
                onNavigate={onNavigate}
              />
              <NavItem
                href="/admin/quotas"
                icon={<PieChart className="w-4 h-4" />}
                label="Kuota Cuti"
                active={pathname === '/admin/quotas'}
                onNavigate={onNavigate}
              />
              <NavItem
                href="/admin/quota-histories"
                icon={<History className="w-4 h-4" />}
                label="Histori Kuota"
                active={pathname === '/admin/quota-histories'}
                onNavigate={onNavigate}
              />
            </div>

            <div className="space-y-1">
              <p className="px-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Management
              </p>
              <NavItem
                href="/admin/users"
                icon={<Users className="w-4 h-4" />}
                label="Users"
                active={pathname === '/admin/users'}
                onNavigate={onNavigate}
              />
            </div>
          </>
        )}
      </nav>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40 shrink-0">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-850">
          <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm border border-indigo-500/30">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{userName}</p>
            <p className="text-[11px] text-slate-400 truncate">{userEmail}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
};

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onNavigate?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ href, icon, label, active, onNavigate }) => {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 group',
        active
          ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-900/50'
          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
      )}
    >
      <span className={cn('transition-colors', active ? 'text-white' : 'text-slate-400 group-hover:text-slate-200')}>
        {icon}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {active && <ChevronRight className="w-3.5 h-3.5 text-indigo-300" />}
    </Link>
  );
};
