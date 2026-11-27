'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Label satuan data, mis. "karyawan". */
  itemLabel?: string;
  /** Pilihan jumlah per halaman; tampil bila `onPageSizeChange` diisi. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
}

type PageItem = number | 'gap-left' | 'gap-right';

/** Nomor halaman yang ditampilkan: 1 … 4 5 [6] 7 8 … 20 (maks. 7 slot). */
function buildPages(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items: PageItem[] = [1];
  let start = Math.max(2, Math.min(page - 1, totalPages - 4));
  let end = Math.min(totalPages - 1, Math.max(page + 1, 5));
  // Celah satu halaman tidak perlu "…": tampilkan nomornya saja.
  if (start === 3) start = 2;
  if (end === totalPages - 2) end = totalPages - 1;
  if (start > 2) items.push('gap-left');
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < totalPages - 1) items.push('gap-right');
  items.push(totalPages);
  return items;
}

const baseBtn =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-40';

/** Pagination di tengah: nomor halaman + tombol pertama/sebelumnya/berikutnya/terakhir. */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  itemLabel = 'data',
  pageSizeOptions = [10, 25, 50],
  onPageSizeChange,
  className,
}: PaginationProps) {
  const safeTotalPages = Math.max(1, totalPages);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const go = (p: number) => {
    if (p >= 1 && p <= safeTotalPages && p !== page) onPageChange(p);
  };

  const iconBtn = cn(baseBtn, 'text-slate-500 hover:bg-slate-100 hover:text-slate-900');

  return (
    <nav aria-label="Navigasi halaman" className={cn('flex flex-col items-center gap-2', className)}>
      <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button type="button" className={iconBtn} onClick={() => go(1)} disabled={page <= 1} aria-label="Halaman pertama">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button type="button" className={iconBtn} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Halaman sebelumnya">
          <ChevronLeft className="h-4 w-4" />
        </button>

        {buildPages(page, safeTotalPages).map((item) =>
          typeof item === 'number' ? (
            <button
              key={item}
              type="button"
              onClick={() => go(item)}
              aria-label={`Halaman ${item}`}
              aria-current={item === page ? 'page' : undefined}
              className={cn(
                baseBtn,
                item === page
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                  : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
              )}
            >
              {item}
            </button>
          ) : (
            <span key={item} className="inline-flex h-9 min-w-6 items-center justify-center text-xs text-slate-400" aria-hidden="true">
              …
            </span>
          )
        )}

        <button
          type="button"
          className={iconBtn}
          onClick={() => go(page + 1)}
          disabled={page >= safeTotalPages}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={iconBtn}
          onClick={() => go(safeTotalPages)}
          disabled={page >= safeTotalPages}
          aria-label="Halaman terakhir"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>
          Menampilkan <span className="font-semibold text-slate-700">{from}–{to}</span> dari{' '}
          <span className="font-semibold text-slate-700">{total}</span> {itemLabel}
        </span>
        {onPageSizeChange && (
          <label className="inline-flex items-center gap-1.5">
            <span className="text-slate-300" aria-hidden="true">
              |
            </span>
            Tampilkan
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
              aria-label="Jumlah per halaman"
              className="h-7 rounded-md border border-slate-300 bg-white px-1.5 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            per halaman
          </label>
        )}
      </div>
    </nav>
  );
}
