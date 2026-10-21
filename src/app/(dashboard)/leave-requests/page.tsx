'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { formatDate, formatDateTime } from '@/lib/utils';
import { CalendarPlus, Eye, Ban } from 'lucide-react';
import { LeaveStatus } from '@prisma/client';

interface QuotaInfoPerType {
  leaveTypeId: string;
  leaveTypeName: string;
  /** Total hari jenis cuti ini pada pengajuan (jumlah semua rentang jenis ini). */
  daysRequested: number;
  /** Sisa kuota SEBELUM pengajuan ini. null = tak terbatas / belum ada kuota. */
  previousRemaining: number | null;
  /** Hari yang benar-benar dipotong pengajuan ini. */
  usedByThisRequest: number;
  /** Sisa kuota SETELAH pengajuan ini. null = tak terbatas / tidak diketahui. */
  remainingAfter: number | null;
  /** Sisa kuota SEKARANG (live). null = tak terbatas. */
  currentRemaining: number | null;
}

interface QuotaInfo {
  perType: QuotaInfoPerType[];
  totalDaysRequested: number;
  totalUsedByThisRequest: number;
  /** false = pengajuan ini belum/tidak memotong kuota (ON_PROGRESS / REJECTED / CANCELLED). */
  statusAffectsQuota: boolean;
}

interface LeaveRequestItem {
  id: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  adminNote?: string | null;
  attachmentUrl?: string | null;
  createdAt: string;
  quotaInfo?: QuotaInfo | null;
  requestTypes: Array<{
    id: string;
    leaveType: {
      name: string;
    };
  }>;
}

const DASH = '—';

/** Teks sisa kuota: null = tak terbatas, angka = "X Hari". */
function formatRemaining(value: number | null): string {
  return value === null ? 'Tak terbatas' : `${value} Hari`;
}

/** Warna penekanan sisa kuota: 0 → merah, ≤ 3 → amber, lainnya netral. */
function remainingClass(value: number | null): string {
  if (value === null) return 'text-slate-500 font-medium';
  if (value <= 0) return 'text-rose-600 font-bold';
  if (value <= 3) return 'text-amber-600 font-semibold';
  return 'text-slate-800 font-semibold';
}

const QUOTA_UNLIMITED_HINT = 'Kuota tidak terbatas / belum ada kuota untuk jenis cuti ini';
const QUOTA_NOT_AFFECTED_HINT = 'Status pengajuan ini belum memotong kuota cuti';

/**
 * Isi satu sel kuota. Untuk pengajuan multi-jenis cuti, nilai ditampilkan
 * per jenis (satu baris kecil per jenis) agar tidak digabung menyesatkan.
 */
function QuotaCell({
  quotaInfo,
  field,
}: {
  quotaInfo?: QuotaInfo | null;
  field: 'previousRemaining' | 'usedByThisRequest' | 'currentRemaining';
}) {
  if (!quotaInfo || quotaInfo.perType.length === 0) {
    return <span className="text-slate-400">{DASH}</span>;
  }

  const multiType = quotaInfo.perType.length > 1;
  const notAffected = !quotaInfo.statusAffectsQuota;

  // "Terpakai" untuk pengajuan yang belum memotong kuota: tampilkan — + tooltip.
  if (field === 'usedByThisRequest' && notAffected) {
    return (
      <span className="text-slate-400 cursor-help" title={QUOTA_NOT_AFFECTED_HINT}>
        {DASH}
      </span>
    );
  }

  const renderValue = (item: QuotaInfoPerType) => {
    if (field === 'usedByThisRequest') {
      const value = item.usedByThisRequest;
      return (
        <span className={value > 0 ? 'text-indigo-700 font-bold' : 'text-slate-500 font-medium'}>
          {value > 0 ? `${value} Hari` : '0 Hari'}
        </span>
      );
    }

    const value = item[field];
    return (
      <span className={remainingClass(value)} title={value === null ? QUOTA_UNLIMITED_HINT : undefined}>
        {formatRemaining(value)}
      </span>
    );
  };

  if (!multiType) {
    return <div className="whitespace-nowrap text-right">{renderValue(quotaInfo.perType[0])}</div>;
  }

  return (
    <div className="space-y-0.5">
      {quotaInfo.perType.map((item) => (
        <div
          key={item.leaveTypeId}
          className="flex items-baseline justify-end gap-1 whitespace-nowrap"
          title={item.leaveTypeName}
        >
          <span className="text-[10px] font-medium text-slate-500 truncate max-w-[104px]">
            {item.leaveTypeName}:
          </span>
          <span className="text-[11px]">{renderValue(item)}</span>
        </div>
      ))}
    </div>
  );
}

/** Ambil riwayat pengajuan cuti milik user yang sedang login. */
async function fetchLeaveRequests(): Promise<LeaveRequestItem[]> {
  const res = await fetch('/api/leave-requests');
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.message || 'Gagal memuat riwayat pengajuan cuti');
  }
  return json.data as LeaveRequestItem[];
}

export default function UserLeaveRequestsHistoryPage() {
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReq, setSelectedReq] = useState<LeaveRequestItem | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      setRequests(await fetchLeaveRequests());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    fetchLeaveRequests()
      .then((data) => {
        if (active) setRequests(data);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleCancelRequest = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan pengajuan cuti ini?')) return;

    setCancellingId(id);
    setActionMsg(null);

    try {
      const res = await fetch(`/api/leave-requests/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: LeaveStatus.CANCELLED }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal membatalkan pengajuan');
      }

      setActionMsg({ type: 'success', text: 'Pengajuan cuti berhasil dibatalkan' });
      fetchRequests();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membatalkan pengajuan';
      setActionMsg({ type: 'error', text: message });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Riwayat Pengajuan Cuti</h1>
          <p className="text-xs text-slate-500 mt-1">
            Daftar lengkap seluruh permohonan cuti dan izin meninggalkan kerja yang pernah Anda ajukan.
          </p>
        </div>
        <Link href="/leave-requests/create">
          <Button size="md">
            <CalendarPlus className="w-4 h-4" /> + Ajukan Cuti
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

      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th rowSpan={2} className="px-6 py-3.5 align-middle">Tanggal Dibuat</th>
                <th rowSpan={2} className="px-6 py-3.5 align-middle">Jenis Cuti</th>
                <th rowSpan={2} className="px-6 py-3.5 align-middle">Periode Tanggal</th>
                <th rowSpan={2} className="px-6 py-3.5 text-right align-middle">Jumlah Hari</th>
                <th
                  colSpan={4}
                  className="px-4 py-2 text-center border-l border-slate-200 border-b border-slate-200"
                >
                  Kuota Cuti
                </th>
                <th rowSpan={2} className="px-6 py-3.5 align-middle">Status</th>
                <th rowSpan={2} className="px-6 py-3.5 text-center align-middle">Aksi</th>
              </tr>
              <tr className="text-[10px]">
                <th className="px-4 py-2 text-right border-l border-slate-200 whitespace-nowrap">
                  Hari Dipakai
                </th>
                <th className="px-4 py-2 text-right whitespace-nowrap">Sisa Sebelum</th>
                <th className="px-4 py-2 text-right whitespace-nowrap">Terpakai</th>
                <th className="px-4 py-2 text-right whitespace-nowrap">Sisa Saat Ini</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-400">
                    Memuat riwayat pengajuan cuti...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-slate-400">
                    Belum ada riwayat pengajuan cuti.
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-500 whitespace-nowrap">
                      {formatDateTime(req.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {req.requestTypes.map((rt) => (
                          <span
                            key={rt.id}
                            className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-xs border border-slate-200 font-medium"
                          >
                            {rt.leaveType.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800 whitespace-nowrap">
                      {formatDate(req.startDate)} s/d {formatDate(req.endDate)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900 whitespace-nowrap">
                      {req.totalDays} Hari
                    </td>
                    <td className="px-4 py-4 text-right whitespace-nowrap border-l border-slate-100">
                      {req.quotaInfo ? (
                        <span className="font-bold text-slate-900">
                          {req.quotaInfo.totalDaysRequested} Hari
                        </span>
                      ) : (
                        <span className="text-slate-400">{DASH}</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <QuotaCell quotaInfo={req.quotaInfo} field="previousRemaining" />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <QuotaCell quotaInfo={req.quotaInfo} field="usedByThisRequest" />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <QuotaCell quotaInfo={req.quotaInfo} field="currentRemaining" />
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link href={`/leave-requests/${req.id}`}>
                          <button
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Lihat Detail Lengkap"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </Link>
                        {(req.status === LeaveStatus.ON_PROGRESS ||
                          req.status === LeaveStatus.APPROVED) && (
                          <button
                            onClick={() => handleCancelRequest(req.id)}
                            disabled={cancellingId === req.id}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Batalkan Pengajuan"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Modal */}
      {selectedReq && (
        <Modal
          isOpen={!!selectedReq}
          onClose={() => setSelectedReq(null)}
          title="Detail Pengajuan Cuti"
          description={`ID: #${selectedReq.id.substring(0, 8)}`}
        >
          <div className="space-y-4 text-xs text-slate-700">
            <div>
              <p className="font-semibold text-slate-500">Jenis Cuti</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {selectedReq.requestTypes.map((rt) => (
                  <span
                    key={rt.id}
                    className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200"
                  >
                    {rt.leaveType.name}
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <p className="font-semibold text-slate-500">Tanggal Mulai</p>
                <p className="font-bold text-slate-900 mt-0.5">{formatDate(selectedReq.startDate)}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Tanggal Selesai</p>
                <p className="font-bold text-slate-900 mt-0.5">{formatDate(selectedReq.endDate)}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-500">Total Durasi Hari</p>
                <p className="text-base font-extrabold text-indigo-900">{selectedReq.totalDays} Hari</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Status Permohonan</p>
                <div className="mt-1">
                  <StatusBadge status={selectedReq.status} />
                </div>
              </div>
            </div>

            {selectedReq.quotaInfo && selectedReq.quotaInfo.perType.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-500">Rincian Kuota</p>
                  <p className="text-[10px] text-slate-500">
                    Total dipakai: {selectedReq.quotaInfo.totalDaysRequested} Hari
                  </p>
                </div>

                {!selectedReq.quotaInfo.statusAffectsQuota && (
                  <p className="mt-1 text-[11px] text-slate-500">{QUOTA_NOT_AFFECTED_HINT}.</p>
                )}

                <div className="mt-2 space-y-2">
                  {selectedReq.quotaInfo.perType.map((item) => {
                    const notAffected = !selectedReq.quotaInfo!.statusAffectsQuota;
                    const cells: Array<{ label: string; value: string; className: string; title?: string }> = [
                      {
                        label: 'Sisa Sebelum',
                        value: formatRemaining(item.previousRemaining),
                        className: remainingClass(item.previousRemaining),
                        title: item.previousRemaining === null ? QUOTA_UNLIMITED_HINT : undefined,
                      },
                      {
                        label: 'Terpakai',
                        value: notAffected ? DASH : `${item.usedByThisRequest} Hari`,
                        className: notAffected
                          ? 'text-slate-400 font-medium'
                          : item.usedByThisRequest > 0
                            ? 'text-indigo-700 font-bold'
                            : 'text-slate-500 font-medium',
                        title: notAffected ? QUOTA_NOT_AFFECTED_HINT : undefined,
                      },
                      {
                        label: 'Sisa Setelah',
                        value: formatRemaining(item.remainingAfter),
                        className: remainingClass(item.remainingAfter),
                        title: item.remainingAfter === null ? QUOTA_UNLIMITED_HINT : undefined,
                      },
                      {
                        label: 'Sisa Saat Ini',
                        value: formatRemaining(item.currentRemaining),
                        className: remainingClass(item.currentRemaining),
                        title: item.currentRemaining === null ? QUOTA_UNLIMITED_HINT : undefined,
                      },
                    ];

                    return (
                      <div key={item.leaveTypeId} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-bold text-slate-900 text-[11px]">{item.leaveTypeName}</p>
                          <span className="text-[10px] font-semibold text-slate-500">
                            {item.daysRequested} Hari diajukan
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                          {cells.map((cell) => (
                            <div key={cell.label} title={cell.title}>
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                                {cell.label}
                              </p>
                              <p className={`text-[11px] mt-0.5 ${cell.className}`}>{cell.value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <p className="font-semibold text-slate-500">Keterangan / Alasan</p>
              <p className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800 mt-1 whitespace-pre-line">
                {selectedReq.reason}
              </p>
            </div>

            {selectedReq.adminNote && (
              <div className="pt-2 border-t border-slate-100">
                <p className="font-semibold text-amber-700">Catatan Admin</p>
                <p className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900 mt-1">
                  {selectedReq.adminNote}
                </p>
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <Button variant="outline" onClick={() => setSelectedReq(null)}>
                Tutup
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
