import React from 'react';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getDashboardStats, getLeaveRequests } from '@/services/leave.service';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';

export default async function AdminDashboardPage() {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return null;

  const stats = await getDashboardStats();
  const recentRequests = await getLeaveRequests();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Dashboard Administrator
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Ringkasan statistik karyawan, permohonan cuti, dan persetujuan HCM Best HCM.
        </p>
      </div>

      {/* 6 Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card className="border-l-4 border-l-indigo-600 bg-white p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total User</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.totalUsers}</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Karyawan Terdaftar</p>
        </Card>

        <Card className="border-l-4 border-l-slate-700 bg-white p-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Pengajuan</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.totalRequests}</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Seluruh Pengajuan</p>
        </Card>

        <Card className="border-l-4 border-l-amber-500 bg-white p-4">
          <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Menunggu Approval</p>
          <h3 className="text-2xl font-black text-amber-600 mt-1">{stats.pendingCount}</h3>
          <p className="text-[10px] text-amber-600/80 mt-0.5">Status ON_PROGRESS</p>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 bg-white p-4">
          <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Approved</p>
          <h3 className="text-2xl font-black text-emerald-600 mt-1">{stats.approvedCount}</h3>
          <p className="text-[10px] text-emerald-600/80 mt-0.5">Disetujui</p>
        </Card>

        <Card className="border-l-4 border-l-rose-600 bg-white p-4">
          <p className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Rejected</p>
          <h3 className="text-2xl font-black text-rose-600 mt-1">{stats.rejectedCount}</h3>
          <p className="text-[10px] text-rose-600/80 mt-0.5">Ditolak</p>
        </Card>

        <Card className="border-l-4 border-l-slate-400 bg-white p-4">
          <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Cancelled</p>
          <h3 className="text-2xl font-black text-slate-600 mt-1">{stats.cancelledCount}</h3>
          <p className="text-[10px] text-slate-400 mt-0.5">Dibatalkan User</p>
        </Card>
      </div>

      {/* Recent Leave Requests Table */}
      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Pengajuan Cuti Terbaru</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar pengajuan cuti yang memerlukan tindak lanjut atau persetujuan Admin.
            </p>
          </div>
          <Link
            href="/admin/leave-requests"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            Kelola Seluruh Pengajuan <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Nama User</th>
                <th className="px-6 py-3.5">Jenis Cuti</th>
                <th className="px-6 py-3.5">Tanggal</th>
                <th className="px-6 py-3.5 text-right">Jumlah Hari</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {recentRequests.slice(0, 5).map((req) => (
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
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-xs border border-slate-200"
                        >
                          {rt.leaveType.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-700">
                    {formatDate(req.startDate)} - {formatDate(req.endDate)}
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-slate-900">
                    {req.totalDays} Hari
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Link
                      href={`/admin/leave-requests/${req.id}`}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-900 underline"
                    >
                      Detail Cuti ↗
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
