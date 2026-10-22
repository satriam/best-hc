'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SpklStatusBadge } from '@/components/spkl/SpklStatusBadge';
import { SPKL_STATUS_LABEL, SPKL_TYPE_LABEL, formatHours } from '@/components/spkl/spkl-ui';
import type { SpklListItem, SpklPagination, SpklStatusValue, SpklTypeValue } from '@/components/spkl/types';
import { formatDateTime } from '@/lib/utils';
import {
  Ban,
  Clock,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Timer,
  TrendingUp,
} from 'lucide-react';

const PAGE_SIZE = 10;

function firstDayOfMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Ambil satu halaman daftar SPKL (tanpa menyentuh state — dipakai di effect). */
async function fetchSpklList(
  params: URLSearchParams
): Promise<{ items: SpklListItem[]; pagination: SpklPagination }> {
  const response = await fetch(`/api/spkl?${params.toString()}`);
  const json = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.message || 'Gagal memuat daftar SPKL');
  }
  return {
    items: Array.isArray(json.data) ? (json.data as SpklListItem[]) : [],
    pagination: (json.pagination as SpklPagination) ?? {
      page: 1,
      limit: PAGE_SIZE,
      total: 0,
      totalPages: 1,
    },
  };
}

/** Ringkasan SPKL bulan berjalan (total SPKL, total jam, menunggu persetujuan). */
async function fetchSpklSummary(): Promise<SummaryState> {
  const params = new URLSearchParams({
    createdFrom: firstDayOfMonth(),
    createdTo: todayKey(),
    limit: '100',
  });
  const response = await fetch(`/api/spkl?${params.toString()}`);
  const json = await response.json();
  if (!response.ok || !json.success || !Array.isArray(json.data)) {
    return { count: 0, totalHours: 0, pending: 0 };
  }
  const rows = json.data as SpklListItem[];
  return {
    count: rows.length,
    totalHours: Math.round(rows.reduce((sum, row) => sum + Number(row.totalHours || 0), 0) * 100) / 100,
    pending: rows.filter((row) => row.status === 'ON_PROGRESS').length,
  };
}

interface SummaryState {
  count: number;
  totalHours: number;
  pending: number;
}

export default function SpklListPage() {
  const [items, setItems] = useState<SpklListItem[]>([]);
  const [pagination, setPagination] = useState<SpklPagination>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<SummaryState>({ count: 0, totalHours: 0, pending: 0 });
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [status, setStatus] = useState<'' | SpklStatusValue>('');
  const [type, setType] = useState<'' | SpklTypeValue>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [reloadToken, setReloadToken] = useState(0);

  // Debounce pencarian supaya tidak memanggil API pada tiap ketikan.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Muat ulang daftar setiap filter/halaman berubah (setState hanya di callback async).
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (search) params.set('search', search);

    fetchSpklList(params)
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setPagination(result.pagination);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat daftar SPKL');
        setItems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, status, type, from, to, search, reloadToken]);

  useEffect(() => {
    let active = true;

    fetchSpklSummary()
      .then((value) => {
        if (active) setSummary(value);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setSummaryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const handleCancel = async (item: SpklListItem) => {
    if (!confirm(`Batalkan SPKL ${item.number}? Tindakan ini tidak bisa dibatalkan.`)) return;

    setCancellingId(item.id);
    setActionMsg(null);
    try {
      const response = await fetch(`/api/spkl/${item.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CANCELLED' }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Gagal membatalkan SPKL');
      }
      setActionMsg({ type: 'success', text: `SPKL ${item.number} berhasil dibatalkan.` });
      refresh();
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membatalkan SPKL',
      });
    } finally {
      setCancellingId(null);
    }
  };

  const resetFilters = () => {
    setStatus('');
    setType('');
    setFrom('');
    setTo('');
    setSearchInput('');
    setSearch('');
    setPage(1);
  };

  const hasFilter = Boolean(status || type || from || to || search);
  const summaryCards = useMemo(
    () => [
      {
        label: 'Total SPKL Bulan Ini',
        value: summary.count,
        suffix: 'SPKL',
        icon: <Timer className="w-4 h-4" />,
        tone: 'text-indigo-700 bg-indigo-50 border-indigo-200',
      },
      {
        label: 'Total Jam Lembur Bulan Ini',
        value: formatHours(summary.totalHours),
        suffix: 'Jam',
        icon: <TrendingUp className="w-4 h-4" />,
        tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      },
      {
        label: 'Menunggu Persetujuan',
        value: summary.pending,
        suffix: 'SPKL',
        icon: <Clock className="w-4 h-4" />,
        tone: 'text-amber-700 bg-amber-50 border-amber-200',
      },
    ],
    [summary]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-200 shrink-0">
            <Clock className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Surat Perintah Kerja Lembur
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola SPKL: buat, ajukan, pantau persetujuan, dan cetak form resmi.
            </p>
          </div>
        </div>
        <Link href="/spkl/create">
          <Button size="md" className="font-bold">
            <Plus className="w-4 h-4" /> Buat SPKL
          </Button>
        </Link>
      </div>

      {actionMsg && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium ${
            actionMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Kartu ringkasan */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {card.label}
                </p>
                <p className="mt-1.5 text-2xl font-extrabold text-slate-900 leading-none">
                  {summaryLoading ? '—' : card.value}
                  <span className="ml-1.5 text-xs font-semibold text-slate-500">{card.suffix}</span>
                </p>
              </div>
              <span className={`w-9 h-9 rounded-lg border flex items-center justify-center ${card.tone}`}>
                {card.icon}
              </span>
            </div>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <Card className="p-4 md:p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label htmlFor="spkl-search" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Cari
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="spkl-search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Nomor SPKL, nama, atau NIK pekerja"
                className="w-full h-10 rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="spkl-status" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Status
            </label>
            <select
              id="spkl-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as '' | SpklStatusValue);
                setPage(1);
              }}
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Semua status</option>
              {(Object.keys(SPKL_STATUS_LABEL) as SpklStatusValue[]).map((value) => (
                <option key={value} value={value}>
                  {SPKL_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="spkl-type" className="block text-[11px] font-semibold text-slate-600 mb-1">
              Jenis Lembur
            </label>
            <select
              id="spkl-type"
              value={type}
              onChange={(event) => {
                setType(event.target.value as '' | SpklTypeValue);
                setPage(1);
              }}
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Semua jenis</option>
              {(Object.keys(SPKL_TYPE_LABEL) as SpklTypeValue[]).map((value) => (
                <option key={value} value={value}>
                  {SPKL_TYPE_LABEL[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="spkl-from" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Dari
              </label>
              <input
                id="spkl-from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="spkl-to" className="block text-[11px] font-semibold text-slate-600 mb-1">
                Sampai
              </label>
              <input
                id="spkl-to"
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {hasFilter && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-slate-500">
              Filter aktif — menampilkan {pagination.total} SPKL.
            </p>
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RefreshCw className="w-3.5 h-3.5" /> Reset filter
            </Button>
          </div>
        )}
      </Card>

      {error && (
        <div className="p-4 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Tabel */}
      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Nomor</th>
                <th className="px-5 py-3.5">Tanggal Dibuat</th>
                <th className="px-5 py-3.5">Jenis Lembur</th>
                <th className="px-4 py-3.5 text-center">Jumlah Pekerja</th>
                <th className="px-4 py-3.5 text-right">Total Jam</th>
                <th className="px-5 py-3.5">PIC (Yang Menugaskan)</th>
                <th className="px-5 py-3.5">Penyetuju</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Memuat daftar SPKL...
                    </span>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <span className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                        <Clock className="w-6 h-6" />
                      </span>
                      <p className="text-sm font-bold text-slate-700">
                        Belum ada SPKL. Buat yang pertama.
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {hasFilter
                          ? 'Tidak ada SPKL yang cocok dengan filter. Coba reset filter.'
                          : 'SPKL dipakai untuk menugaskan kerja lembur pekerja alih daya.'}
                      </p>
                      <Link href="/spkl/create" className="mt-1">
                        <Button size="sm">
                          <Plus className="w-4 h-4" /> Buat SPKL
                        </Button>
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const canEdit = item.status === 'DRAFT' || item.status === 'ON_PROGRESS';
                  const canCancel =
                    item.status === 'DRAFT' || item.status === 'ON_PROGRESS' || item.status === 'REJECTED';
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <Link
                          href={`/spkl/${item.id}`}
                          className="font-bold text-indigo-700 hover:text-indigo-900 hover:underline"
                        >
                          {item.number}
                        </Link>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {item.itemCount} baris rincian
                        </p>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap font-medium text-slate-500">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] border border-slate-200 font-medium whitespace-nowrap">
                          {SPKL_TYPE_LABEL[item.type]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-slate-900">
                        {item.workerCount}
                      </td>
                      <td className="px-4 py-4 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatHours(item.totalHours)} Jam
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{item.pic.name}</p>
                        <p className="text-[10px] text-slate-500 truncate max-w-[180px]">
                          {item.pic.position || '—'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{item.approver.name}</p>
                        <p className="text-[10px] text-slate-500 truncate max-w-[180px]">
                          {item.approver.department || item.approver.position || '—'}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <SpklStatusBadge status={item.status} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/spkl/${item.id}`}
                            title="Lihat detail"
                            aria-label={`Lihat detail ${item.number}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          {canEdit && (
                            <Link
                              href={`/spkl/${item.id}/edit`}
                              title="Edit SPKL"
                              aria-label={`Edit ${item.number}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </Link>
                          )}
                          <Link
                            href={`/spkl/${item.id}?print=1`}
                            title="Cetak form resmi"
                            aria-label={`Cetak ${item.number}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                          >
                            <Printer className="w-4 h-4" />
                          </Link>
                          {canCancel && (
                            <button
                              type="button"
                              onClick={() => handleCancel(item)}
                              disabled={cancellingId === item.id}
                              title="Batalkan SPKL"
                              aria-label={`Batalkan ${item.number}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
                            >
                              {cancellingId === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Ban className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/60">
            <p className="text-[11px] text-slate-500">
              Halaman {pagination.page} dari {pagination.totalPages} — {pagination.total} SPKL
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Sebelumnya
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
