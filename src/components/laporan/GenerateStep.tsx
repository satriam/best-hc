'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import type { LaporanSigner } from './types';
import { ApprovalPreview, CoverPreview } from './CoverPreview';
import { SignatureTable, personFromSigner } from './SignatureTable';
import {
  averagePercent,
  countFilledItems,
  periodDisplay,
  sectionStats,
  type WizardState,
} from './wizard-state';

interface GenerateStepProps {
  state: WizardState;
  signers: LaporanSigner[];
  generating: boolean;
  finalizing: boolean;
  onGenerate: () => void;
  onArchive: () => void;
  onBack: () => void;
  onGoToStep: (step: number) => void;
}

/**
 * Langkah 4 — generate .docx lalu (opsional) arsipkan ke Google Drive.
 *
 * `POST /api/laporan/generate` mengembalikan file biner + header
 * `X-Laporan-Id`; id itu dipakai untuk `POST /api/laporan/:id/selesai`.
 */
export function GenerateStep({
  state,
  signers,
  generating,
  finalizing,
  onGenerate,
  onArchive,
  onBack,
  onGoToStep,
}: GenerateStepProps) {
  const filledItems = countFilledItems(state.modules);
  const avgPercent = averagePercent(state.modules);
  const sectionSummary = sectionStats(state.modules);

  const signerName = (id: string): string => {
    const found = signers.find((signer) => signer.id === id);
    return found ? `${found.name}${found.position ? ` — ${found.position}` : ''}` : '— (default master)';
  };

  const signerRecord = (id: string): LaporanSigner | null =>
    signers.find((signer) => signer.id === id) ?? null;

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Ringkasan laporan</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Periksa kembali sebelum dokumen dibuat. Generate dengan periode + proyek + versi yang sama akan
            memperbarui draft sebelumnya (bukan membuat baris baru).
          </p>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs">
          <SummaryRow label="Nama proyek" value={state.meta.project || '—'} onEdit={() => onGoToStep(1)} />
          <SummaryRow label="Judul cover" value={state.meta.coverTitle || '—'} onEdit={() => onGoToStep(1)} />
          <SummaryRow label="Judul dokumen" value={state.meta.title || '—'} onEdit={() => onGoToStep(1)} />
          <SummaryRow label="No dokumen" value={state.meta.docNo || '—'} onEdit={() => onGoToStep(1)} />
          <SummaryRow label="Nomor SPPH" value={state.meta.spphNo || '—'} onEdit={() => onGoToStep(1)} />
          <SummaryRow label="Periode" value={periodDisplay(state.meta)} onEdit={() => onGoToStep(1)} />
          <SummaryRow label="Versi" value={state.meta.version || '1.0'} onEdit={() => onGoToStep(1)} />
          <SummaryRow label="Tanggal dokumen" value={state.meta.date || '—'} onEdit={() => onGoToStep(1)} />
        </dl>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Stat label="Pengembangan" value={`${sectionSummary.development.count} item`} />
          <Stat label="Pemeliharaan" value={`${sectionSummary.maintenance.count} item`} />
          <Stat label="Modul" value={String(sectionSummary.moduleCount)} />
          <Stat label="Rata-rata %" value={filledItems === 0 ? '—' : `${avgPercent}%`} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CoverPreview
            project={state.meta.project}
            coverTitle={state.meta.coverTitle}
            spphNo={state.meta.spphNo}
            periodLabel={periodDisplay(state.meta)}
          />
          <ApprovalPreview
            project={state.meta.project}
            docNo={state.meta.docNo}
            title={state.meta.title}
            periodLabel={periodDisplay(state.meta)}
          />
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Pratinjau Lembar Persetujuan (sama dengan dokumen)
          </p>
          <div className="rounded-lg border border-slate-200 bg-white p-2 sm:p-3">
            <SignatureTable
              dibuat={personFromSigner(signerRecord(state.signers.dibuat))}
              diperiksa={personFromSigner(signerRecord(state.signers.diperiksa))}
              disetujui={personFromSigner(signerRecord(state.signers.disetujui))}
              disetujui2={personFromSigner(signerRecord(state.signers.disetujui2))}
              tanggal={state.meta.date}
            />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-[11px] space-y-1">
          <p className="font-semibold uppercase tracking-wider text-slate-500 mb-1">Penanda tangan</p>
          <p className="text-slate-700">
            <span className="font-semibold">Dibuat:</span> {signerName(state.signers.dibuat)}
          </p>
          <p className="text-slate-700">
            <span className="font-semibold">Diperiksa:</span> {signerName(state.signers.diperiksa)}
          </p>
          <p className="text-slate-700">
            <span className="font-semibold">Disetujui:</span> {signerName(state.signers.disetujui)}
            {state.signers.disetujui2
              ? ` / ${signerName(state.signers.disetujui2)}`
              : ''}
          </p>
          <button
            type="button"
            onClick={() => onGoToStep(3)}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
          >
            <Pencil className="w-3 h-3" /> Ubah penanda tangan
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={onGenerate}
            disabled={generating || filledItems === 0}
            className="font-bold"
            data-testid="laporan-generate"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : state.generated ? (
              <RefreshCw className="w-4 h-4" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            {generating
              ? 'Membuat dokumen...'
              : state.generated
                ? 'Generate ulang & unduh'
                : 'Buat laporan (.docx)'}
          </Button>
          {state.generated && (
            <a
              href={`/laporan/${state.generated.id}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Buka detail laporan
            </a>
          )}
        </div>

        {state.generated && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 space-y-2">
            <p className="flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Dokumen berhasil dibuat & diunduh
            </p>
            <p className="text-[11px] text-emerald-800">
              {state.generated.fileName} · disimpan sebagai draft (id {state.generated.id.slice(0, 8)}…)
            </p>

            <div className="pt-2 border-t border-emerald-200/70">
              <Checkbox
                label="Selesai — simpan ke Google Drive"
                description="Dokumen diarsipkan ke folder Drive 'Laporan Bulanan' dan status laporan menjadi selesai."
                checked={Boolean(state.drive)}
                disabled={finalizing || Boolean(state.drive)}
                onChange={(event) => {
                  if (event.target.checked) onArchive();
                }}
                data-testid="laporan-archive"
              />
              {finalizing && (
                <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-800">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengunggah ke Google Drive...
                </p>
              )}
              {state.drive && (
                <div className="mt-2 rounded-lg bg-white border border-emerald-200 p-2.5 text-[11px] text-slate-700 space-y-1">
                  <p className="font-bold text-emerald-700 flex items-center gap-1.5">
                    <CloudUpload className="w-3.5 h-3.5" /> Tersimpan di Drive
                  </p>
                  <p className="truncate">{state.drive.fileName}</p>
                  <a
                    href={state.drive.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:text-indigo-900 break-all"
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" /> Buka file di Google Drive
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
        <Button type="button" variant="outline" onClick={onBack} className="font-semibold">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Button>
        {state.drive ? (
          <Link href="/laporan">
            <Button type="button" variant="success" className="font-bold w-full sm:w-auto">
              <CheckCircle2 className="w-4 h-4" /> Selesai — lihat daftar laporan
            </Button>
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 sm:self-center">
            <Download className="w-3.5 h-3.5" /> Dokumen terunduh ke folder Download Anda.
          </span>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-dashed border-slate-200 pb-1.5">
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
        <dd className="text-xs font-semibold text-slate-900 break-words">{value}</dd>
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Ubah ${label}`}
        className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors shrink-0"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-extrabold text-slate-900 leading-tight">{value}</p>
    </div>
  );
}
