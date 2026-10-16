'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { formatDate, formatDateTime } from '@/lib/utils';
import { CalendarPlus, Eye, Ban, FileText, CheckCircle, Clock } from 'lucide-react';
import { LeaveStatus } from '@prisma/client';

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
  requestTypes: Array<{
    id: string;
    leaveType: {
      name: string;
    };
  }>;
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
      const res = await fetch('/api/leave-requests');
      const json = await res.json();
      if (json.success) {
        setRequests(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
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
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err.message });
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
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Tanggal Dibuat</th>
                <th className="px-6 py-3.5">Jenis Cuti</th>
                <th className="px-6 py-3.5">Periode Tanggal</th>
                <th className="px-6 py-3.5 text-right">Jumlah Hari</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    Memuat riwayat pengajuan cuti...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    Belum ada riwayat pengajuan cuti.
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-500">
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
                    <td className="px-6 py-4 font-medium text-slate-800">
                      {formatDate(req.startDate)} s/d {formatDate(req.endDate)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">
                      {req.totalDays} Hari
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
