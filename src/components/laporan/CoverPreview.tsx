'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface PreviewRow {
  label: string;
  value: string;
}

/** Kotak putih dengan label di atas — satu baris per field dokumen. */
function PreviewBox({
  heading,
  rows,
  testId,
  className,
}: {
  heading: string;
  rows: PreviewRow[];
  testId: string;
  className?: string;
}) {
  return (
    <div data-testid={testId} className={cn(className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">{heading}</p>
      <div className="bg-white border border-slate-300 rounded-lg px-3 py-2.5 sm:px-4 sm:py-3">
        <table className="w-full text-[11px] sm:text-xs text-slate-900">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="align-top">
                <td className="py-0.5 pr-2 w-[96px] sm:w-[112px] text-slate-600 whitespace-nowrap">
                  {row.label}
                </td>
                <td className="py-0.5 font-semibold break-words">
                  {row.value?.trim() ? row.value : <span className="text-slate-400 font-normal">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Pratinjau COVER (sampul) — 4 baris: Nama Proyek, Judul (pendek),
 * Nomor SPPH, Periode. No Dokumen tidak ditampilkan di cover.
 */
export function CoverPreview({
  project,
  coverTitle,
  spphNo,
  periodLabel,
  className,
}: {
  project: string;
  coverTitle: string;
  spphNo: string;
  periodLabel: string;
  className?: string;
}) {
  return (
    <PreviewBox
      className={cn(className)}
      heading="Pratinjau Cover"
      testId="laporan-cover-preview"
      rows={[
        { label: 'Nama Proyek', value: project },
        { label: 'Judul', value: coverTitle },
        { label: 'Nomor SPPH', value: spphNo },
        { label: 'Periode', value: periodLabel },
      ]}
    />
  );
}

/**
 * Pratinjau LEMBAR PERSETUJUAN — 3 baris: Nama Proyek, No Dokumen,
 * Judul Dokumen (judul panjang + periode menempel, seperti tag
 * `{title} Periode {period}` pada template). SPPH tidak ditampilkan di sini.
 */
export function ApprovalPreview({
  project,
  docNo,
  title,
  periodLabel,
  className,
}: {
  project: string;
  docNo: string;
  title: string;
  periodLabel: string;
  className?: string;
}) {
  const judul = [title?.trim(), periodLabel?.trim() ? `Periode ${periodLabel.trim()}` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <PreviewBox
      className={cn(className)}
      heading="Pratinjau Lembar Persetujuan"
      testId="laporan-approval-preview"
      rows={[
        { label: 'Nama Proyek', value: project },
        { label: 'No Dokumen', value: docNo },
        { label: 'Judul Dokumen', value: judul },
      ]}
    />
  );
}
