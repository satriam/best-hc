'use client';

import React from 'react';
import { Input } from '@/components/ui/Input';

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export interface QuotaResetValue {
  joinDate: string;
  quotaResetMonth: number;
  quotaResetDay: number;
}

interface Props {
  value: QuotaResetValue;
  onChange: (value: QuotaResetValue) => void;
}

/**
 * Tanggal masuk + tanggal reset kuota cuti tahunan.
 * Tanggal reset dibatasi 1–28 supaya selalu ada di setiap bulan.
 */
export function QuotaResetFields({ value, onChange }: Props) {
  const useJoinDate = () => {
    const match = value.joinDate.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (!match) return;
    onChange({
      ...value,
      quotaResetMonth: Number(match[1]),
      quotaResetDay: Math.min(28, Number(match[2])),
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-bold text-slate-700 mb-1">Tanggal Masuk</label>
          <Input
            type="date"
            value={value.joinDate}
            onChange={(e) => onChange({ ...value, joinDate: e.target.value })}
          />
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-1">Reset Kuota Cuti Tahunan</label>
          <div className="flex gap-2">
            <select
              aria-label="Tanggal reset"
              value={value.quotaResetDay}
              onChange={(e) => onChange({ ...value, quotaResetDay: Number(e.target.value) })}
              className="h-10 w-20 rounded-lg border border-slate-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <select
              aria-label="Bulan reset"
              value={value.quotaResetMonth}
              onChange={(e) => onChange({ ...value, quotaResetMonth: Number(e.target.value) })}
              className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {MONTHS.map((month, i) => (
                <option key={month} value={i + 1}>
                  {month}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>Sisa kuota periode lama hangus saat reset. Cuti yang melewati tanggal reset dipecah per periode.</span>
        <button
          type="button"
          onClick={useJoinDate}
          disabled={!value.joinDate}
          className="font-semibold text-indigo-600 hover:underline disabled:text-slate-400 disabled:no-underline"
        >
          Samakan dengan tanggal masuk
        </button>
      </div>
    </div>
  );
}
