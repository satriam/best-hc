'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { formatDateTime } from '@/lib/utils';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';

/**
 * Kartu "Dokumen Tanda Tangan" untuk SPKL & Pengajuan Cuti.
 *
 * File PDF hasil scan tanda tangan disimpan di Google Drive oleh backend
 * (`/api/documents/[entityType]/[entityId]`). Kartu ini:
 * - merender PDF dokumen aktif LANGSUNG di halaman lewat iframe
 *   `https://drive.google.com/file/d/<driveFileId>/preview`
 *   (URL `/view` diblokir Google untuk embed, jadi jangan dipakai di iframe),
 * - menyediakan fallback "Buka di tab baru" memakai `driveWebViewLink`,
 * - menyediakan upload / ganti / hapus untuk ADMIN.
 *
 * Satu entity hanya punya SATU dokumen: ganti dokumen menghapus dokumen lama
 * (baris DB + file Drive), jadi tidak ada daftar "versi lama" di kartu ini.
 */

export type SignedDocumentEntityType = 'SPKL' | 'LEAVE_REQUEST';

export interface SignedDocumentDto {
  id: string;
  entityType: SignedDocumentEntityType;
  entityId: string;
  fileName: string;
  driveFileId: string;
  driveWebViewLink: string;
  mimeType: string;
  sizeBytes: number;
  isActive: boolean;
  createdAt: string;
  uploadedBy?: { id: string; name: string } | null;
}

interface SignedDocumentCardProps {
  entityType: SignedDocumentEntityType;
  entityId: string;
  /** Hanya ADMIN yang boleh upload / ganti / hapus. */
  isAdmin: boolean;
  className?: string;
}

/** Batas ukuran sama dengan `MAX_PDF_BYTES` di backend (10 MB). */
const MAX_PDF_BYTES = 10 * 1024 * 1024;

/** Google hanya mengizinkan embed lewat pola `/file/d/<id>/preview`. */
function drivePreviewUrl(driveFileId: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
}

export function SignedDocumentCard({
  entityType,
  entityId,
  isAdmin,
  className = '',
}: SignedDocumentCardProps) {
  const [documents, setDocuments] = useState<SignedDocumentDto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Catatan non-fatal dari server saat upload/ganti: dokumen SUDAH tersimpan,
   * tapi ada langkah sampingan yang gagal (mis. file lama gagal dihapus dari
   * Drive). Ditampilkan sebagai notice amber, bukan error merah.
   */
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<SignedDocumentDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** URL iframe yang sudah selesai dimuat — dipakai untuk skeleton (tanpa effect). */
  const [loadedPreviewSrc, setLoadedPreviewSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const endpoint = `/api/documents/${entityType}/${entityId}`;

  const loadDocuments = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Gagal memuat daftar dokumen');
      }
      const list = Array.isArray(json.data) ? (json.data as SignedDocumentDto[]) : [];
      setDocuments(list);
    } catch (err) {
      setDocuments([]);
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat daftar dokumen');
    }
  }, [endpoint]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadDocuments();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDocuments]);

  const activeDocument = documents?.find((doc) => doc.isActive) ?? null;
  const previewSrc = activeDocument ? drivePreviewUrl(activeDocument.driveFileId) : null;
  const isLoading = documents === null;

  // Skeleton tampil sampai iframe dengan URL ini selesai dimuat (tanpa effect/setState).
  const viewerLoading = !!previewSrc && loadedPreviewSrc !== previewSrc;

  const openFilePicker = () => {
    setFormError(null);
    setNotice(null);
    setWarnings([]);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset supaya memilih file yang sama dua kali tetap memicu onChange.
    event.target.value = '';
    if (!file) return;

    setNotice(null);
    setFormError(null);
    setWarnings([]);

    // ---- Validasi di client (backend tetap memvalidasi ulang) ----
    if (file.type !== 'application/pdf') {
      setFormError('File bukan PDF. Pilih file dengan ekstensi .pdf.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setFormError(`Ukuran file melebihi 10 MB (file ini ${formatFileSize(file.size)}).`);
      return;
    }
    if (file.size === 0) {
      setFormError('File kosong. Pilih file PDF yang berisi.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(endpoint, { method: 'POST', body: formData });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengunggah dokumen');
      }
      setNotice(json.message || 'Dokumen berhasil diunggah.');
      // `warnings` = langkah sampingan yang gagal padahal dokumen sudah tersimpan
      // (mis. file lama gagal dihapus dari Drive). Kosong = normal.
      setWarnings(
        Array.isArray(json.warnings)
          ? json.warnings.filter(
              (item: unknown): item is string => typeof item === 'string' && item.trim() !== ''
            )
          : []
      );
      // Refetch supaya viewer langsung memuat PDF baru.
      await loadDocuments();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal mengunggah dokumen');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`${endpoint}/${pendingDelete.id}`, { method: 'DELETE' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Gagal menghapus dokumen');
      }
      setPendingDelete(null);
      // Pesan sukses datang dari server ("Dokumen dan file Google Drive berhasil dihapus permanen").
      setNotice(json.message || 'Dokumen dan file Google Drive berhasil dihapus.');
      setWarnings([]);
      await loadDocuments();
    } catch (err) {
      // 502 dari server = file Drive gagal dihapus, dokumen TETAP ada di daftar.
      // Daftar sengaja tidak di-refresh supaya tidak tampak "terhapus".
      setDeleteError(err instanceof Error ? err.message : 'Gagal menghapus dokumen');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className={`p-5 space-y-4 ${className}`} data-testid="signed-doc-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" /> Dokumen Tanda Tangan
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            PDF bertanda tangan untuk dokumen ini, tersimpan di Google Drive.
          </p>
        </div>
        {activeDocument && isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openFilePicker}
              disabled={uploading}
              data-testid="signed-doc-replace-btn"
              className="font-bold"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {uploading ? 'Mengunggah...' : 'Ganti PDF'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setPendingDelete(activeDocument);
              }}
              disabled={uploading || deleting}
              data-testid="signed-doc-delete-btn"
              className="font-bold border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100"
            >
              <Trash2 className="w-3.5 h-3.5" /> Hapus
            </Button>
          </div>
        )}
      </div>

      {/* input file tersembunyi — dipicu tombol Upload / Ganti PDF */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        data-testid="signed-doc-file-input"
        onChange={handleFileSelected}
      />

      {isLoading ? (
        <p className="text-xs text-slate-500 inline-flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat dokumen...
        </p>
      ) : loadError ? (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span data-testid="signed-doc-load-error">{loadError}</span>
          <Button type="button" variant="outline" size="sm" onClick={loadDocuments}>
            <RefreshCw className="w-3.5 h-3.5" /> Coba lagi
          </Button>
        </div>
      ) : activeDocument ? (
        <div className="space-y-3">
          {/* Info dokumen + fallback buka di tab baru */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className="text-sm font-bold text-slate-900 break-all"
                    data-testid="signed-doc-file-name"
                  >
                    {activeDocument.fileName}
                  </p>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {formatFileSize(activeDocument.sizeBytes)} · diunggah{' '}
                  {formatDateTime(activeDocument.createdAt)}
                  {activeDocument.uploadedBy?.name
                    ? ` · oleh ${activeDocument.uploadedBy.name}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={activeDocument.driveWebViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="signed-doc-view-link"
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition-all duration-150 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Buka di tab baru
                </a>
              </div>
            </div>
          </div>

          {/* Viewer inline — PDF tampil langsung di halaman ini */}
          <div className="relative rounded-xl border border-slate-200 bg-white overflow-hidden">
            {viewerLoading && (
              <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-50"
                data-testid="signed-doc-viewer-skeleton"
              >
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                <span className="text-xs font-semibold text-slate-500">Memuat PDF...</span>
                <span className="text-[10px] text-slate-400">
                  PDF dirender dari Google Drive
                </span>
              </div>
            )}
            {previewSrc && (
              <iframe
                key={previewSrc}
                src={previewSrc}
                title={activeDocument.fileName}
                loading="lazy"
                allow="autoplay"
                onLoad={() => setLoadedPreviewSrc(previewSrc)}
                data-testid="signed-doc-viewer"
                data-drive-file-id={activeDocument.driveFileId}
                className="w-full h-[600px] min-h-[600px] border-0 bg-white"
              />
            )}
          </div>
        </div>
      ) : (
        <div
          className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 flex flex-wrap items-center justify-between gap-3"
          data-testid="signed-doc-empty"
        >
          <p className="text-xs font-semibold text-slate-500">Belum ada PDF bertanda tangan</p>
          {isAdmin && (
            <Button
              type="button"
              size="sm"
              onClick={openFilePicker}
              disabled={uploading}
              data-testid="signed-doc-upload-btn"
              className="font-bold"
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {uploading ? 'Mengunggah...' : 'Upload PDF Tanda Tangan'}
            </Button>
          )}
        </div>
      )}

      {uploading && (
        <p
          className="text-[11px] font-semibold text-indigo-700 inline-flex items-center gap-2"
          data-testid="signed-doc-uploading"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengunggah PDF ke Google Drive...
        </p>
      )}

      <div aria-live="polite" className="space-y-2">
        {formError && (
          <div
            className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2"
            data-testid="signed-doc-error"
          >
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{formError}</span>
          </div>
        )}
        {notice && (
          <div
            className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-start gap-2"
            data-testid="signed-doc-notice"
          >
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}
        {warnings.length > 0 && (
          <div
            role="status"
            className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium flex items-start gap-2"
            data-testid="signed-doc-warnings"
          >
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
            <div className="min-w-0 space-y-1">
              <p className="font-bold">
                Dokumen sudah tersimpan, tetapi ada catatan dari Google Drive:
              </p>
              <ul className="list-disc pl-4 space-y-0.5 break-words">
                {warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`} data-testid="signed-doc-warning-item">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Konfirmasi hapus */}
      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => {
          if (deleting) return;
          setPendingDelete(null);
          setDeleteError(null);
        }}
        title="Hapus dokumen tanda tangan?"
        description="Dokumen dan file PDF-nya di Google Drive akan dihapus permanen. Tindakan ini tidak bisa dibatalkan."
      >
        <div className="space-y-3">
          {deleteError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {deleteError}
            </div>
          )}
          <p className="text-xs text-slate-600 break-all">
            <span className="font-bold">{pendingDelete?.fileName}</span>
          </p>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
            <span>
              File PDF di Google Drive ikut dihapus dan tidak bisa dipulihkan dari aplikasi ini.
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDelete}
              disabled={deleting}
              data-testid="signed-doc-confirm-delete"
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Hapus Dokumen
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

export default SignedDocumentCard;
