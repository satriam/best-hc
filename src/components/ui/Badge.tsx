import React from 'react';
import { cn } from '@/lib/utils';
import { LeaveStatus } from '@prisma/client';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: LeaveStatus | string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'secondary';
}

export const StatusBadge: React.FC<BadgeProps> = ({ status, className, children, ...props }) => {
  let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-200';

  switch (status) {
    case 'ON_PROGRESS':
      badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200 ring-1 ring-amber-300/50';
      break;
    case 'APPROVED':
      badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-300/50';
      break;
    case 'REJECTED':
      badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200 ring-1 ring-rose-300/50';
      break;
    case 'DONE':
      badgeStyle = 'bg-blue-50 text-blue-800 border-blue-200 ring-1 ring-blue-300/50 font-extrabold';
      break;
    case 'CANCELLED':
      badgeStyle = 'bg-slate-100 text-slate-600 border-slate-200 ring-1 ring-slate-300/50';
      break;
    case 'ADMIN':
      badgeStyle = 'bg-indigo-50 text-indigo-700 border-indigo-200 ring-1 ring-indigo-300/50';
      break;
    case 'USER':
      badgeStyle = 'bg-blue-50 text-blue-700 border-blue-200 ring-1 ring-blue-300/50';
      break;
  }

  const labelMap: Record<string, string> = {
    ON_PROGRESS: 'ON_PROGRESS',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    CANCELLED: 'CANCELLED',
    DONE: 'DONE (Selesai)',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border transition-all duration-150',
        badgeStyle,
        className
      )}
      {...props}
    >
      {children || (status ? labelMap[status] || status : '')}
    </span>
  );
};
