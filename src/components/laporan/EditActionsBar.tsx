'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Save,
} from 'lucide-react';

export interface EditActionsBarProps {
  laporanId: string;
  /** Status laporan di server saat halaman dibuka (`draft` / `selesai`). */
  status: string;
  /** true = dokumen sudah diubah (generate ulang) tapi Drive belum diperbarui. */
  driveOutdated: boolean;
  savingDraft: boolean;
  generating: boolean;
  finalizing: boolean;
  /** Versi berikutnya hasil generate (mis. `1.1`) untuk opsi versi baru. */
  nextVersion: string;
  saveAsNewVersion: boolean;
  onToggleNewVersion: (value: boolean) => void;
  onSaveDraft: () => void;
  onGenerate: () => void;
  onUpdateDrive: () => void;
  /** Catatan sistem, mis. endpoint simpan draft belum tersedia. */
  notice?: string | null;
}

/**
 * Toolbar halaman edit laporan: Simpan Draft, Generate Ulang, dan (untuk
 * laporan `selesai`) Perbarui di Drive dengan konfirmasi kecil.
 */
export function EditActionsBar({
  laporanId,
  status,
  driveOutdated,
  savingDraft,
  generating,
  finalizing,
  nextVersion,
  saveAsNewVersion,
  onToggleNewVersion,
  onSaveDraft,
  onGenerate,
  onUpdateDrive,
  notice,
}: EditActionsBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = savingDraft || generating || finalizing;

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-indigo-600" /> Mode edit laporan
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Perubahan disimpan sebagai draft. Dokumen .docx dibuat ulang dari data ini.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="font-semibold"
              onClick={onSaveDraft}
              disabled={busy}
              data-testid="laporan-save-draft"
            >
              {savingDraft ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {savingDraft ? 'Menyimpan...' : 'Simpan draft'}
            </Button>

            <Button
              type="button"
              size="sm"
              className="font-bold"
              onClick={onGenerate}
              disabled={busy}
              data-testid="laporan-edit-generate"
            >
              {generating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              {generating ? 'Membuat...' : 'Generate ulang'}
            </Button>

            {status === 'selesai' && (
              <Button
                type="button"
                variant={driveOutdated ? 'primary' : 'secondary'}
                size="sm"
                className="font-bold"
                onClick={() => setConfirmOpen(true)}
                disabled={busy}
                data-testid="laporan-update-drive"
              >
                {finalizing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CloudUpload className="w-3.5 h-3.5" />
                )}
                {finalizing ? 'Memperbarui...' : 'Perbarui di Drive'}
              </Button>
            )}

            <Link
              href={`/laporan/${laporanId}`}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 px-1"
            >
              <ExternalLink className="w-3 h-3" /> Detail
            </Link>
          </div>
        </div>

        {notice && (
          <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            {notice}
          </p>
        )}

        {driveOutdated && (
          <div
            className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-900 flex items-start gap-2"
            data-testid="laporan-drive-outdated"
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div className="space-y-1">
              <p className="font-bold">Perubahan belum tersimpan di Drive</p>
              <p>
                Dokumen .docx sudah dibuat ulang di server, tetapi salinan Drive masih versi lama.
                Tekan <strong>Perbarui di Drive</strong> untuk menggantinya.
              </p>
            </div>
          </div>
        )}
      </Card>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Perbarui file di Drive"
            className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-5 space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" /> Perbarui arsip Google Drive
            </h3>
            <p className="text-xs text-slate-600">
              File lama di Drive akan diganti dengan dokumen terbaru.
            </p>

            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={saveAsNewVersion}
                onChange={(event) => onToggleNewVersion(event.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                data-testid="laporan-new-version"
              />
              <span>
                <span className="font-semibold">Simpan sebagai versi baru ({nextVersion})</span>
                <span className="block text-[11px] text-slate-500">
                  Versi saat ini tetap tersimpan sebagai riwayat.
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmOpen(false)}
                disabled={finalizing}
              >
                Batal
              </Button>
              <Button
                type="button"
                variant="success"
                size="sm"
                className="font-semibold"
                disabled={finalizing}
                onClick={() => {
                  setConfirmOpen(false);
                  onUpdateDrive();
                }}
                data-testid="laporan-confirm-drive"
              >
                {finalizing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Perbarui sekarang
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
