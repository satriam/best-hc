'use client';

import React from 'react';
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
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  userRole?: 'ADMIN' | 'USER';
  userName?: string;
  userEmail?: string;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  userRole = 'USER',
  userName = 'User',
  userEmail = '',
  onLogout,
}) => {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
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
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0 border-r border-slate-800 select-none z-30">
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-slate-800/80 bg-slate-950/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-900/50">
          <Building2 className="w-5 h-5 stroke-[2.2]" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
            Best HCM
          </h1>
          <p className="text-[10px] uppercase font-semibold tracking-wider text-indigo-400">
            {userRole === 'ADMIN' ? 'Admin Portal' : 'Employee Portal'}
          </p>
        </div>
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
            />
            <NavItem
              href="/leave-requests/create"
              icon={<CalendarPlus className="w-4 h-4" />}
              label="Pengajuan Cuti"
              active={pathname === '/leave-requests/create'}
            />
            <NavItem
              href="/leave-requests"
              icon={<History className="w-4 h-4" />}
              label="Riwayat Cuti"
              active={pathname === '/leave-requests'}
            />
            <NavItem
              href="/profile"
              icon={<User className="w-4 h-4" />}
              label="Profil"
              active={pathname === '/profile'}
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
              />
              <NavItem
                href="/admin/leave-types"
                icon={<Layers className="w-4 h-4" />}
                label="Jenis Cuti"
                active={pathname === '/admin/leave-types'}
              />
              <NavItem
                href="/admin/holidays"
                icon={<CalendarDays className="w-4 h-4" />}
                label="Hari Libur"
                active={pathname === '/admin/holidays'}
              />
              <NavItem
                href="/admin/quotas"
                icon={<PieChart className="w-4 h-4" />}
                label="Kuota Cuti"
                active={pathname === '/admin/quotas'}
              />
              <NavItem
                href="/admin/quota-histories"
                icon={<History className="w-4 h-4" />}
                label="Histori Kuota"
                active={pathname === '/admin/quota-histories'}
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
              />
            </div>
          </>
        )}
      </nav>

      {/* User Profile Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ href, icon, label, active }) => {
  return (
    <Link
      href={href}
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
