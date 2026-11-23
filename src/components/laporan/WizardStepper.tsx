'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export const WIZARD_STEPS = [
  { step: 1, label: 'Upload', hint: 'Unggah .docx' },
  { step: 2, label: 'Review Item', hint: 'Periksa modul & fitur' },
  { step: 3, label: 'Penanda Tangan', hint: 'Pilih penanda tangan' },
  { step: 4, label: 'Generate', hint: 'Buat & arsipkan' },
] as const;

/**
 * Stepper wizard. Di layar kecil (< md) berubah menjadi bar atas yang ringkas:
 * judul langkah aktif + indikator progres, sesuai kebutuhan mobile.
 */
export function WizardStepper({
  step,
  maxStep,
  onSelect,
}: {
  step: number;
  /** Langkah terjauh yang sudah boleh dibuka. */
  maxStep: number;
  onSelect: (step: number) => void;
}) {
  const active = WIZARD_STEPS.find((entry) => entry.step === step) ?? WIZARD_STEPS[0];

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm shadow-slate-100 p-3 md:p-4">
      {/* Mobile: bar atas */}
      <div className="md:hidden space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-slate-900">
            <span className="text-indigo-600">Langkah {step}</span> dari {WIZARD_STEPS.length} — {active.label}
          </p>
          <span className="text-[11px] text-slate-500">{active.hint}</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${(step / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop: stepper penuh */}
      <ol className="hidden md:flex items-center gap-2" aria-label="Langkah pembuatan laporan">
        {WIZARD_STEPS.map((entry, index) => {
          const isDone = entry.step < step;
          const isActive = entry.step === step;
          const unlocked = entry.step <= maxStep;

          return (
            <li key={entry.step} className="flex items-center gap-2 flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => unlocked && onSelect(entry.step)}
                disabled={!unlocked}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left transition-all',
                  isActive
                    ? 'bg-indigo-50 border-indigo-300 shadow-sm'
                    : isDone
                      ? 'bg-white border-emerald-200 hover:bg-emerald-50/60'
                      : unlocked
                        ? 'bg-white border-slate-200 hover:bg-slate-50'
                        : 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                )}
              >
                <span
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0',
                    isActive
                      ? 'bg-indigo-600 text-white'
                      : isDone
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                  )}
                >
                  {isDone ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : entry.step}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-xs font-bold truncate',
                      isActive ? 'text-indigo-900' : 'text-slate-700'
                    )}
                  >
                    {entry.label}
                  </span>
                  <span className="block text-[10px] text-slate-500 truncate">{entry.hint}</span>
                </span>
              </button>
              {index < WIZARD_STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn('h-px flex-1 min-w-4', isDone ? 'bg-emerald-300' : 'bg-slate-200')}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
