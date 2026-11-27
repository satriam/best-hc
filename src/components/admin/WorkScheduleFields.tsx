'use client';

import React from 'react';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { isRosterWorkDay, isValidRosterPattern, ROSTER_PRESETS } from '@/lib/roster';

export interface WorkScheduleValue {
  workType: 'NON_SHIFT' | 'SHIFT';
  rosterPattern: string;
  rosterStartDate: string;
}

interface Props {
  value: WorkScheduleValue;
  onChange: (value: WorkScheduleValue) => void;
}

const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** Pratinjau 14 hari mulai hari ini menurut pola roster. */
function preview(pattern: string, startDate: string) {
  if (!isValidRosterPattern(pattern) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return [];
  const roster = { pattern, startDate: new Date(startDate) };
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return Array.from({ length: 14 }, (_, i) => {
    const date = new Date(today.getTime() + i * 86400000);
    return {
      key: date.toISOString().slice(0, 10),
      day: DAY_NAMES[date.getUTCDay()],
      date: date.getUTCDate(),
      work: isRosterWorkDay(roster, date),
    };
  });
}

/**
 * Setelan tipe kerja karyawan. SHIFT memakai pola roster (K = kerja, L = libur)
 * sehingga hari libur roster tidak memotong kuota cuti.
 */
export function WorkScheduleFields({ value, onChange }: Props) {
  const isShift = value.workType === 'SHIFT';
  const pattern = value.rosterPattern;
  const days = preview(pattern, value.rosterStartDate);

  const setPattern = (next: string) => onChange({ ...value, rosterPattern: next });
  const toggleDay = (index: number) =>
    setPattern(pattern.slice(0, index) + (pattern[index] === 'K' ? 'L' : 'K') + pattern.slice(index + 1));

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div>
        <label className="block font-bold text-slate-700 mb-1">Tipe Kerja</label>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {(['NON_SHIFT', 'SHIFT'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  workType: type,
                  rosterPattern: type === 'SHIFT' && !value.rosterPattern ? 'KKKKLL' : value.rosterPattern,
                })
              }
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
                value.workType === type ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {type === 'SHIFT' ? 'Shift' : 'Non Shift'}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {isShift
            ? 'Cuti hanya dihitung di hari kerja roster. Libur roster tidak memotong kuota.'
            : 'Libur mengikuti Sabtu, Minggu, dan libur nasional.'}
        </p>
      </div>

      {isShift && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Pola Cepat</label>
              <select
                value={ROSTER_PRESETS.some((p) => p.pattern === pattern) ? pattern : ''}
                onChange={(e) => e.target.value && setPattern(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Kustom</option>
                {ROSTER_PRESETS.map((p) => (
                  <option key={p.pattern} value={p.pattern}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Tanggal Mulai Pola (Hari ke-1)</label>
              <Input
                type="date"
                value={value.rosterStartDate}
                onChange={(e) => onChange({ ...value, rosterStartDate: e.target.value })}
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700">Pola Roster ({pattern.length} hari, klik untuk ubah)</label>
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={pattern.length <= 2}
                  onClick={() => setPattern(pattern.slice(0, -1))}
                  className="h-6 w-6 rounded border border-slate-300 bg-white text-xs font-bold disabled:opacity-40"
                  aria-label="Kurangi hari"
                >
                  −
                </button>
                <button
                  type="button"
                  disabled={pattern.length >= 28}
                  onClick={() => setPattern(pattern + 'K')}
                  className="h-6 w-6 rounded border border-slate-300 bg-white text-xs font-bold disabled:opacity-40"
                  aria-label="Tambah hari"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {pattern.split('').map((ch, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  title={`Hari ke-${i + 1}: ${ch === 'K' ? 'Kerja' : 'Libur'}`}
                  className={cn(
                    'h-8 w-8 rounded-md text-[11px] font-bold border',
                    ch === 'K'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-rose-50 border-rose-300 text-rose-700'
                  )}
                >
                  {ch}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">K = kerja, L = libur. Pola berulang terus mulai tanggal di atas.</p>
          </div>

          {days.length > 0 && (
            <div>
              <p className="font-bold text-slate-700 mb-1">Pratinjau 14 Hari ke Depan</p>
              <div className="grid grid-cols-7 gap-1">
                {days.map((d) => (
                  <div
                    key={d.key}
                    className={cn(
                      'rounded-md border px-1 py-1 text-center text-[10px] leading-tight',
                      d.work ? 'bg-white border-slate-200 text-slate-700' : 'bg-rose-50 border-rose-200 text-rose-700'
                    )}
                  >
                    <div className="font-semibold">{d.day}</div>
                    <div className="text-xs font-bold">{d.date}</div>
                    <div>{d.work ? 'Kerja' : 'Libur'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
