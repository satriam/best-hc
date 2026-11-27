'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DeleteLaporanModal } from '@/components/laporan/DeleteLaporanModal';
import { DocPreviewModal } from '@/components/laporan/DocPreviewModal';
import { LaporanToast, useLaporanToast } from '@/components/laporan/Toast';
import { LaporanStatusChip } from '@/components/laporan/LaporanStatusChip';
import { apiErrorMessage, periodLabel } from '@/components/laporan/laporan-ui';
import type { LaporanListItem } from '@/components/laporan/types';
import { formatDateTime } from '@/lib/utils';
import {
  CloudDownload,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileSearch,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';

async function fetchLaporan(params: URLSearchParams): Promise<LaporanListItem[]> {
  const response = await fetch(`/api/laporan?${params.toString()}`);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(apiErrorMessage(json, 'Gagal memuat daftar laporan'));
  }
  return Array.isArray(json.data) ? (json.data as LaporanListItem[]) : [];
}

/** Daftar laporan bulanan yang sudah pernah di-generate. */
export default function LaporanListPage() {
  const { toast, showToast, clearToast } = useLaporanToast();
  const [previewTarget, setPreviewTarget] = useState<LaporanListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LaporanListItem | null>(null);
  const [items, setItems] = useState<LaporanListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('');
  const [status, setStatus] = useState<'' | 'draft' | 'selesai'>('');
  const [reloadToken, setReloadToken] = useState(0);
  // `loading` diturunkan dari kunci permintaan supaya tidak perlu setState
  // sinkron di dalam effect (aturan react-hooks/set-state-in-effect).
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${period}|${status}|${reloadToken}`;
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    let active = true;

    const params = new URLSearchParams();
    if (period) params.set('period', period);
    if (status) params.set('status', status);

    fetchLaporan(params)
      .then((rows) => {
        if (!active) return;
        setItems(rows);
        setError(null);
        setLoadedKey(requestKey);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Gagal memuat daftar laporan';
        setError(message);
        setItems([]);
        setLoadedKey(requestKey);
      });

    return () => {
      active = false;
    };
  }, [period, status, requestKey]);

  // Muat ulang manual memberi umpan balik toast (tanpa alert()).
  const handleRefresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const summary = useMemo(() => {
    return {
      total: items.length,
      draft: items.filter((item) => item.status === 'draft').length,
      selesai: items.filter((item) => item.status === 'selesai').length,
    };
  }, [items]);

  const hasFilter = Boolean(period || status);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-200 shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Laporan Bulanan</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar laporan pengembangan aplikasi per periode, lengkap dengan arsip Google Drive.
            </p>
          </div>
        </div>
        <Link href="/laporan/baru">
          <Button size="md" className="font-bold">
            <Plus className="w-4 h-4" /> Buat Laporan
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total laporan', value: summary.total, tone: 'text-indigo-700 bg-indigo-50 border-indigo-200', icon: <FileText className="w-4 h-4" /> },
          { label: 'Draft', value: summary.draft, tone: 'text-slate-700 bg-slate-100 border-slate-200', icon: <FileText className="w-4 h-4" /> },
          { label: 'Selesai (Drive)', value: summary.selesai, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: <CloudDownload className="w-4 h-4" /> },
        ].map((card) => (
          <Card key={card.label} className="p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{card.label}</p>
                <p className="mt-1.5 text-2xl font-extrabold text-slate-900 leading-none">
                  {loading ? '—' : card.value}
                </p>
              </div>
              <span className={`w-9 h-9 rounded-lg border flex items-center justify-center ${card.tone}`}>
                {card.icon}
              </span>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 md:p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="laporan-filter-period" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Periode
            </label>
            <input
              id="laporan-filter-period"
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="laporan-filter-status" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Status
            </label>
            <select
              id="laporan-filter-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as '' | 'draft' | 'selesai')}
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Semua status</option>
              <option value="draft">Draft</option>
              <option value="selesai">Selesai</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              size="md"
              className="font-semibold w-full sm:w-auto"
              onClick={() => {
                setPeriod('');
                setStatus('');
              }}
              disabled={!hasFilter}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset filter
            </Button>
          </div>
          <div className="flex items-end justify-start lg:justify-end">
            <Button variant="ghost" size="md" className="font-semibold" onClick={handleRefresh} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Muat ulang
            </Button>
          </div>
        </div>
      </Card>

      <LaporanToast toast={toast} onClose={clearToast} />
      <DocPreviewModal
        id={previewTarget?.id ?? null}
        title={previewTarget?.title}
        onClose={() => setPreviewTarget(null)}
      />
      <DeleteLaporanModal
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={(id) => {
          setItems((rows) => rows.filter((row) => row.id !== id));
          setDeleteTarget(null);
          showToast('success', 'Laporan dihapus.');
        }}
        onError={(message) => showToast('error', message)}
      />

      {error && (
        <div className="p-4 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs font-semibold">
          {error}
        </div>
      )}

      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Periode</th>
                <th className="px-5 py-3.5">Proyek</th>
                <th className="px-5 py-3.5">Judul</th>
                <th className="px-4 py-3.5 text-center">Versi</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-center">Item</th>
                <th className="px-4 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Memuat daftar laporan...
                    </span>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <span className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                        <FileSpreadsheet className="w-6 h-6" />
                      </span>
                      <p className="text-sm font-bold text-slate-700">
                        {hasFilter ? 'Tidak ada laporan yang cocok dengan filter.' : 'Belum ada laporan bulanan.'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {hasFilter
                          ? 'Coba reset filter untuk melihat semua laporan.'
                          : 'Buat laporan pertama dengan mengunggah dokumen periode sebelumnya.'}
                      </p>
                      {!hasFilter && (
                        <Link href="/laporan/baru" className="mt-1">
                          <Button size="sm">
                            <Plus className="w-4 h-4" /> Buat Laporan
                          </Button>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-4 whitespace-nowrap">
                      <p className="font-bold text-slate-900">{periodLabel(item.period)}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Diperbarui {formatDateTime(item.updatedAt)}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800 max-w-[220px] truncate" title={item.projectName}>
                        {item.projectName}
                      </p>
                      {item.docNo && <p className="text-[10px] text-slate-400 truncate">{item.docNo}</p>}
                    </td>
                    <td className="px-5 py-4">
                      <Link
                        href={`/laporan/${item.id}`}
                        className="font-semibold text-indigo-700 hover:text-indigo-900 hover:underline max-w-[260px] block truncate"
                        title={item.title}
                      >
                        {item.title}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-center font-semibold text-slate-700 whitespace-nowrap">
                      v{item.version}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <LaporanStatusChip status={item.status} />
                        {item.status === 'selesai' && item.driveLink && (
                          <a
                            href={item.driveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-900"
                          >
                            <ExternalLink className="w-3 h-3" /> Drive
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center font-bold text-slate-900">{item.itemCount}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <Link
                          href={`/laporan/${item.id}`}
                          title="Lihat detail"
                          aria-label={`Lihat detail ${item.title}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPreviewTarget(item)}
                          title="Pratinjau dokumen"
                          aria-label={`Pratinjau dokumen ${item.title}`}
                          data-testid={`laporan-preview-${item.id}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                        >
                          <FileSearch className="w-4 h-4" />
                        </button>
                        <Link
                          href={`/laporan/${item.id}/edit`}
                          title="Edit laporan"
                          aria-label={`Edit ${item.title}`}
                          data-testid={`laporan-edit-${item.id}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        {item.driveLink && (
                          <a
                            href={item.driveLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Buka arsip Drive"
                            aria-label={`Buka arsip Drive ${item.title}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <CloudDownload className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          title="Hapus laporan"
                          aria-label={`Hapus ${item.title}`}
                          data-testid={`laporan-delete-${item.id}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && items.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 text-[11px] text-slate-500">
            Menampilkan {items.length} laporan{hasFilter ? ' (terfilter)' : ''}.
          </div>
        )}
      </Card>
    </div>
  );
}
