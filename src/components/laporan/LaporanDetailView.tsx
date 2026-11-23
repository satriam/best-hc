'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DeleteLaporanModal } from '@/components/laporan/DeleteLaporanModal';
import { DocPreviewModal } from '@/components/laporan/DocPreviewModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LaporanStatusChip } from '@/components/laporan/LaporanStatusChip';
import { LaporanToast, useLaporanToast } from '@/components/laporan/Toast';
import { apiErrorMessage, downloadBlob, formatBytes, periodLabel } from '@/components/laporan/laporan-ui';
import type { LaporanDetail, LaporanSavedPayload } from '@/components/laporan/types';
import { formatDateTime } from '@/lib/utils';
import {
  ArrowLeft,
  CheckCircle2,
  CloudDownload,
  ExternalLink,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';

interface GroupedModule {
  name: string;
  items: NonNullable<LaporanSavedPayload['items']>;
}

/** Kelompokkan item tersimpan per modul (urutan asli dipertahankan). */
function groupItems(payload: LaporanSavedPayload | null): GroupedModule[] {
  if (!payload) return [];
  const groups: GroupedModule[] = [];
  payload.items.forEach((item) => {
    const name = item.modul?.trim() || 'Umum';
    const found = groups.find((group) => group.name === name);
    if (found) found.items.push(item);
    else groups.push({ name, items: [item] });
  });
  return groups;
}

async function fetchDetail(id: string): Promise<LaporanDetail> {
  const response = await fetch(`/api/laporan/${id}`);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(apiErrorMessage(json, 'Gagal memuat detail laporan'));
  }
  return json.data as LaporanDetail;
}

/** Halaman detail satu laporan: meta, item, penanda tangan, unduh & arsip. */
export function LaporanDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { toast, showToast, clearToast } = useLaporanToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [detail, setDetail] = useState<LaporanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let active = true;

    // setState hanya di callback async agar tidak memicu render sinkron di effect.
    fetchDetail(id)
      .then((data) => {
        if (!active) return;
        setDetail(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat detail laporan');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, reloadToken]);

  const payload = detail?.meta ?? null;
  const groups = useMemo(() => groupItems(payload), [payload]);

  const handleRegenerate = async () => {
    if (!payload) {
      showToast('error', 'Payload laporan tidak tersimpan — buat ulang lewat wizard.');
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch('/api/laporan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') ?? '';
        const json = contentType.includes('application/json')
          ? await response.json().catch(() => null)
          : null;
        throw new Error(apiErrorMessage(json, 'Gagal membuat ulang dokumen'));
      }

      const fileName = response.headers.get('X-Laporan-File-Name') ?? 'laporan-bulanan.docx';
      const blob = await response.blob();
      downloadBlob(blob, fileName);
      showToast('success', `Dokumen dibuat ulang (${formatBytes(blob.size)}) dan mulai diunduh.`);
      reload();
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Gagal membuat ulang dokumen');
    } finally {
      setGenerating(false);
    }
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    try {
      const response = await fetch(`/api/laporan/${id}/selesai`, { method: 'POST' });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(apiErrorMessage(json, 'Gagal menyimpan laporan ke Google Drive'));
      }
      showToast('success', 'Laporan tersimpan di Google Drive dan ditandai selesai.');
      reload();
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Gagal menyimpan laporan ke Google Drive');
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-200 shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight break-words">
              {detail ? detail.title : 'Detail laporan'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 break-words">
              {detail ? `${detail.projectName} · ${periodLabel(detail.period)} · v${detail.version}` : 'Memuat...'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link href="/laporan">
            <Button variant="ghost" size="sm" className="font-semibold">
              <ArrowLeft className="w-3.5 h-3.5" /> Daftar laporan
            </Button>
          </Link>
          <Link href={`/laporan/${id}/edit`}>
            <Button variant="outline" size="sm" className="font-semibold" data-testid="laporan-detail-edit">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            className="font-semibold"
            onClick={() => setPreviewOpen(true)}
            disabled={loading || !payload}
            data-testid="laporan-detail-preview"
          >
            <FileSearch className="w-3.5 h-3.5" /> Pratinjau
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="font-semibold"
            onClick={handleRegenerate}
            disabled={generating || loading || !payload}
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Generate ulang
          </Button>
          {detail?.status !== 'selesai' && (
            <Button
              variant="success"
              size="sm"
              className="font-bold"
              onClick={handleFinalize}
              disabled={finalizing || loading || !payload}
            >
              {finalizing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              Tandai selesai
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            className="font-semibold"
            onClick={() => setDeleteOpen(true)}
            disabled={loading || !detail}
            data-testid="laporan-detail-delete"
          >
            <Trash2 className="w-3.5 h-3.5" /> Hapus
          </Button>
        </div>
      </div>

      <LaporanToast toast={toast} onClose={clearToast} />
      <DocPreviewModal id={previewOpen ? id : null} title={detail?.title} onClose={() => setPreviewOpen(false)} />
      <DeleteLaporanModal
        target={deleteOpen && detail ? { id, title: detail.title, driveLink: detail.driveLink } : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => router.push('/laporan')}
        onError={(message) => showToast('error', message)}
      />

      {error && (
        <Card className="border-rose-200 bg-rose-50">
          <p className="text-xs font-semibold text-rose-800">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
            Coba lagi
          </Button>
        </Card>
      )}

      {loading && !detail && (
        <Card className="text-center py-10 text-slate-400">
          <span className="inline-flex items-center gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat detail laporan...
          </span>
        </Card>
      )}

      {detail && (
        <>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <LaporanStatusChip status={detail.status} />
              {detail.driveLink ? (
                <a
                  href={detail.driveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-900"
                >
                  <CloudDownload className="w-4 h-4" /> Tersimpan di Google Drive
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-[11px] text-slate-500">Belum diarsipkan ke Drive.</span>
              )}
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-xs">
              <MetaRow label="Periode" value={periodLabel(detail.period)} />
              <MetaRow label="Label periode" value={payload?.meta.periodLabel || '—'} />
              <MetaRow label="Proyek" value={detail.projectName} />
              <MetaRow label="Nomor dokumen" value={detail.docNo || '—'} />
              <MetaRow label="Versi" value={`v${detail.version}`} />
              <MetaRow label="Tanggal dokumen" value={payload?.meta.date || '—'} />
              <MetaRow label="Jumlah item" value={String(detail.itemCount)} />
              <MetaRow label="Dibuat" value={formatDateTime(detail.createdAt)} />
              <MetaRow label="Terakhir diperbarui" value={formatDateTime(detail.updatedAt)} />
            </dl>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" /> Item pekerjaan
              </h2>
              <span className="text-[11px] text-slate-500">{groups.length} modul</span>
            </div>

            {groups.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-slate-500">
                Payload item tidak tersedia. Generate ulang dari wizard untuk melengkapi data.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {groups.map((group) => (
                  <div key={group.name}>
                    <div className="px-5 py-2 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-800">{group.name}</p>
                      <span className="text-[10px] font-semibold text-slate-500">{group.items.length} item</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-left text-xs text-slate-600">
                        <thead className="text-slate-500 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-100">
                          <tr>
                            <th className="px-5 py-2 w-10 text-center">#</th>
                            <th className="px-3 py-2 sticky left-0 z-10 bg-white">Fitur / Pekerjaan</th>
                            <th className="px-3 py-2 w-36">Status</th>
                            <th className="px-3 py-2 w-20 text-center">%</th>
                            <th className="px-3 py-2">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white">
                          {group.items.map((item, index) => (
                            <tr key={`${group.name}-${index}`} className="border-b border-slate-50 last:border-0">
                              <td className="px-5 py-2.5 text-center text-slate-400 font-semibold">{index + 1}</td>
                              <td className="px-3 py-2.5 sticky left-0 z-10 bg-white font-medium text-slate-900">
                                {item.fitur}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700">
                                  {item.status || 'Selesai'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center font-semibold text-slate-800">
                                {item.percent === undefined || item.percent === '' ? '—' : `${item.percent}%`}
                              </td>
                              <td className="px-3 py-2.5 text-slate-500">{item.note || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-bold text-slate-900">Penanda tangan</h2>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="bg-slate-100/70 text-slate-700 uppercase tracking-wider text-[10px] font-semibold">
                  <tr>
                    <th className="px-3 py-2 border-r border-slate-200">Dibuat Oleh</th>
                    <th className="px-3 py-2 border-r border-slate-200">Diperiksa Oleh</th>
                    <th className="px-3 py-2">Disetujui Oleh</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  <tr>
                    <td className="px-3 py-3 border-r border-slate-200 align-top">
                      <SignerCell signer={payload?.signers?.dibuat} />
                    </td>
                    <td className="px-3 py-3 border-r border-slate-200 align-top">
                      <SignerCell signer={payload?.signers?.diperiksa} />
                    </td>
                    <td className="px-3 py-3 align-top space-y-3">
                      <SignerCell signer={payload?.signers?.disetujui} />
                      {payload?.signers?.disetujui2?.nama && (
                        <div className="pt-2 border-t border-dashed border-slate-200">
                          <SignerCell signer={payload.signers.disetujui2} />
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-xs font-semibold text-slate-900 break-words">{value}</dd>
    </div>
  );
}

function SignerCell({
  signer,
}: {
  signer?: { nama?: string; jabatan?: string; instansi?: string; nip?: string } | null;
}) {
  if (!signer?.nama) {
    return <p className="text-[11px] text-slate-400 italic">Tidak tercatat</p>;
  }
  return (
    <div className="min-h-[56px]">
      <p className="text-xs font-bold text-slate-900">{signer.nama}</p>
      {signer.jabatan && <p className="text-[11px] text-slate-600">{signer.jabatan}</p>}
      {signer.instansi && <p className="text-[11px] text-slate-500">{signer.instansi}</p>}
      {signer.nip && <p className="text-[10px] text-slate-400">NIP {signer.nip}</p>}
    </div>
  );
}
