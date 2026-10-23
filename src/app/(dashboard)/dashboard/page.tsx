import React from 'react';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { getDashboardStats, getLeaveRequests } from '@/services/leave.service';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDate } from '@/lib/utils';
import { CalendarPlus, CalendarCheck, Clock, CheckCircle2, ArrowUpRight } from 'lucide-react';

export default async function UserDashboardPage() {
  const session = await getSession();
  if (!session) return null;

  // Statistik kuota dan daftar pengajuan tidak saling bergantung → satu wave paralel.
  const [stats, requests] = await Promise.all([
    getDashboardStats(session.id),
    getLeaveRequests({ userId: session.id }),
  ]);

  return (
    <div className="space-y-8">
      {/* Top Header & Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Selamat datang, {stats.userName}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Ringkasan kuota cuti dan status pengajuan cuti Anda.
          </p>
        </div>
        <Link href="/leave-requests/create">
          <Button size="lg" className="w-full md:w-auto shadow-md">
            <CalendarPlus className="w-4 h-4" />
            + Ajukan Cuti
          </Button>
        </Link>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-l-4 border-l-indigo-600 bg-gradient-to-br from-white to-slate-50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Kuota
              </p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">
                {stats.totalQuota} <span className="text-sm font-semibold text-slate-500">Hari</span>
              </h3>
            </div>
            <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CalendarCheck className="w-6 h-6" />
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-l-amber-500 bg-gradient-to-br from-white to-amber-50/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Terpakai
              </p>
              <h3 className="text-2xl font-black text-amber-700 mt-1">
                {stats.usedQuota} <span className="text-sm font-semibold text-slate-500">Hari</span>
              </h3>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 bg-gradient-to-br from-white to-emerald-50/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Sisa Kuota
              </p>
              <h3 className="text-2xl font-black text-emerald-700 mt-1">
                {stats.remainingQuota} <span className="text-sm font-semibold text-slate-500">Hari</span>
              </h3>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CalendarPlus className="w-6 h-6" />
            </div>
          </div>
        </Card>

        <Card className="border-l-4 border-l-blue-600 bg-gradient-to-br from-white to-blue-50/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Sedang Diproses
              </p>
              <h3 className="text-2xl font-black text-blue-700 mt-1">
                {stats.pendingCount} <span className="text-sm font-semibold text-slate-500">Pengajuan</span>
              </h3>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
          </div>
        </Card>
      </div>

      {/* Leave Requests Table */}
      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Daftar Pengajuan Cuti Saya</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Riwayat dan status seluruh pengajuan cuti yang telah Anda buat.
            </p>
          </div>
          <Link
            href="/leave-requests"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
          >
            Lihat Selengkapnya <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Jenis Cuti</th>
                <th className="px-6 py-3.5">Tanggal</th>
                <th className="px-6 py-3.5 text-right">Jumlah Hari</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    Belum ada pengajuan cuti. Klik <strong>+ Ajukan Cuti</strong> untuk membuat pengajuan baru.
                  </td>
                </tr>
              ) : (
                requests.slice(0, 5).map((req) => (
                  <tr key={req.id} className="hover:bg-indigo-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">
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
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-700">
                        {formatDate(req.startDate)} - {formatDate(req.endDate)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">
                      {req.totalDays} Hari
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={req.status} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Link
                        href={`/leave-requests/${req.id}`}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-900 underline"
                      >
                        Detail Cuti ↗
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
