import React from 'react';
import { cn } from '@/lib/utils';
import { laporanStatusClass, laporanStatusLabel } from './laporan-ui';

/** Chip status laporan: `draft` abu, `selesai` hijau. */
export const LaporanStatusChip: React.FC<{ status: string; className?: string }> = ({
  status,
  className,
}) => (
  <span
    className={cn(
      'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border whitespace-nowrap',
      laporanStatusClass(status),
      className
    )}
  >
    {laporanStatusLabel(status)}
  </span>
);
