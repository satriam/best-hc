'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  Ban,
  Trash2,
  Eye,
  Edit,
  Filter,
  RefreshCw,
  AlertCircle,
  FileText,
  Plus,
} from 'lucide-react';
import { LeaveStatus } from '@prisma/client';

interface LeaveRequestAdminItem {
  id: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  adminNote?: string | null;
  attachmentUrl?: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  requestTypes: Array<{
    id: string;
    leaveType: {
      id: string;
      name: string;
    };
  }>;
}

export default function AdminLeaveRequestsPage() {
  const [requests, setRequests] = useState<LeaveRequestAdminItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchUser, setSearchUser] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<string>('');

  // Modals state
  const [detailReq, setDetailReq] = useState<LeaveRequestAdminItem | null>(null);
  const [approveConfirmReq, setApproveConfirmReq] = useState<LeaveRequestAdminItem | null>(null);
  const [rejectReq, setRejectReq] = useState<LeaveRequestAdminItem | null>(null);
  const [adminNoteInput, setAdminNoteInput] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchUser) params.set('searchUser', searchUser);
      if (statusFilter) params.set('status', statusFilter);
      if (monthFilter && yearFilter) {
        params.set('month', monthFilter);
        params.set('year', yearFilter);
      } else if (yearFilter) {
        params.set('year', yearFilter);
      }

      const res = await fetch(`/api/leave-requests?${params.toString()}`);
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
  }, [statusFilter, monthFilter, yearFilter]);

  const handleStatusUpdate = async (id: string, status: LeaveStatus, note?: string) => {
    setProcessing(true);
    try {
      const res = await fetch(`/api/leave-requests/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          adminNote: note || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengubah status pengajuan');
      }

      setApproveConfirmReq(null);
      setRejectReq(null);
      setAdminNoteInput('');
      fetchRequests();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus pengajuan cuti ini?')) return;
    try {
      const res = await fetch(`/api/leave-requests/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menghapus pengajuan');
      }
      fetchRequests();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Persetujuan Cuti Karyawan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola persetujuan, penolakan, pembatalan, dan detail pengajuan cuti seluruh karyawan.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/leave-requests/create">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              <Plus className="w-4 h-4" /> Buat Pengajuan
            </Button>
          </Link>
          <Button onClick={fetchRequests} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4" /> Refresh Data
          </Button>
        </div>
      </div>

      {/* Filter Section */}
      <Card className="p-4 bg-slate-50/70 border border-slate-200 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
          <Filter className="w-4 h-4 text-indigo-600" /> Filter Data Pengajuan
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search User */}
          <input
            type="text"
            placeholder="Cari nama karyawan..."
            value={searchUser}
            onChange={(e) => setSearchUser(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchRequests()}
            className="h-9 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Semua Status</option>
            <option value="ON_PROGRESS">ON_PROGRESS (Menunggu)</option>
            <option value="APPROVED">APPROVED (Disetujui)</option>
            <option value="REJECTED">REJECTED (Ditolak)</option>
            <option value="CANCELLED">CANCELLED (Dibatalkan)</option>
          </select>

          {/* Month Filter */}
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Semua Bulan</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Bulan {i + 1}
              </option>
            ))}
          </select>

          {/* Year Filter */}
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Semua Tahun</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>

          <Button onClick={fetchRequests} size="sm" className="h-9">
            Terapkan Filter
          </Button>
        </div>
      </Card>

      {/* Main Table */}
      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Nama User</th>
                <th className="px-6 py-3.5">Jenis Cuti</th>
                <th className="px-6 py-3.5">Periode Tanggal</th>
                <th className="px-6 py-3.5 text-right">Durasi</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-center">Aksi Persetujuan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    Memuat data pengajuan cuti...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    Tidak ada pengajuan cuti yang sesuai filter.
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {req.user.name}
                      <span className="block text-[11px] font-normal text-slate-500">{req.user.email}</span>
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
                      {formatDate(req.startDate)} - {formatDate(req.endDate)}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">
                      {req.totalDays} Hari
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <Link href={`/admin/leave-requests/${req.id}`}>
                          <button
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Lihat Detail Lengkap"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </Link>

                        {req.status === LeaveStatus.ON_PROGRESS && (
                          <>
                            <button
                              onClick={() => setApproveConfirmReq(req)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1 shadow-sm"
                              title="Approve Pengajuan"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>

                            <button
                              onClick={() => {
                                setRejectReq(req);
                                setAdminNoteInput('');
                              }}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1 shadow-sm"
                              title="Reject Pengajuan"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </>
                        )}

                        {req.status === LeaveStatus.APPROVED && (
                          <button
                            onClick={() => handleStatusUpdate(req.id, LeaveStatus.CANCELLED, 'Dibatalkan oleh Admin')}
                            className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-semibold"
                            title="Batalkan Approval"
                          >
                            Batalkan
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(req.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Hapus Record"
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
      </Card>

      {/* Approve Confirmation Dialog (Requirement 14 Spec) */}
      {approveConfirmReq && (
        <Modal
          isOpen={!!approveConfirmReq}
          onClose={() => setApproveConfirmReq(null)}
          title="Konfirmasi Persetujuan Cuti"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs text-slate-700">
            <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-100 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-indigo-950 text-sm">
                  Apakah Anda yakin ingin menyetujui pengajuan cuti ini?
                </p>
                <p className="text-indigo-800 mt-1">
                  User: <strong>{approveConfirmReq.user.name}</strong> ({approveConfirmReq.user.email})
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Jumlah cuti:</span>
                <span className="font-bold text-slate-900">{approveConfirmReq.totalDays} hari</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200">
                <span className="text-rose-700 font-bold">Kuota user akan berkurang:</span>
                <span className="font-extrabold text-rose-700">{approveConfirmReq.totalDays} hari</span>
              </div>
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setApproveConfirmReq(null)}>
                Cancel
              </Button>
              <Button
                variant="success"
                disabled={processing}
                onClick={() => handleStatusUpdate(approveConfirmReq.id, LeaveStatus.APPROVED)}
              >
                {processing ? 'Memproses...' : 'Approve'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Dialog */}
      {rejectReq && (
        <Modal
          isOpen={!!rejectReq}
          onClose={() => setRejectReq(null)}
          title="Tolak Pengajuan Cuti"
          description={`User: ${rejectReq.user.name}`}
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Alasan / Catatan Penolakan (Opsional)
              </label>
              <textarea
                rows={3}
                value={adminNoteInput}
                onChange={(e) => setAdminNoteInput(e.target.value)}
                placeholder="Masukkan alasan penolakan untuk disampaikan ke karyawan..."
                className="w-full p-3 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
              <Button variant="outline" onClick={() => setRejectReq(null)}>
                Batal
              </Button>
              <Button
                variant="danger"
                disabled={processing}
                onClick={() => handleStatusUpdate(rejectReq.id, LeaveStatus.REJECTED, adminNoteInput)}
              >
                {processing ? 'Memproses...' : 'Tolak Pengajuan'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {detailReq && (
        <Modal
          isOpen={!!detailReq}
          onClose={() => setDetailReq(null)}
          title="Detail Pengajuan Cuti Karyawan"
          description={`Permohonan oleh ${detailReq.user.name}`}
        >
          <div className="space-y-4 text-xs text-slate-700">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="font-semibold text-slate-500">Pemohon</p>
              <p className="font-bold text-slate-900 text-sm">{detailReq.user.name}</p>
              <p className="text-slate-500">{detailReq.user.email}</p>
            </div>

            <div>
              <p className="font-semibold text-slate-500">Jenis Cuti</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {detailReq.requestTypes.map((rt) => (
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
                <p className="font-bold text-slate-900 mt-0.5">{formatDate(detailReq.startDate)}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Tanggal Selesai</p>
                <p className="font-bold text-slate-900 mt-0.5">{formatDate(detailReq.endDate)}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-500">Total Durasi Hari</p>
                <p className="text-base font-extrabold text-indigo-900">{detailReq.totalDays} Hari</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Status</p>
                <div className="mt-1">
                  <StatusBadge status={detailReq.status} />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <p className="font-semibold text-slate-500">Alasan Permohonan</p>
              <p className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800 mt-1 whitespace-pre-line">
                {detailReq.reason}
              </p>
            </div>

            <div className="pt-4 flex justify-end">
              <Button variant="outline" onClick={() => setDetailReq(null)}>
                Tutup
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
