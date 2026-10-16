import React from 'react';
import { getSession } from '@/lib/auth';
import { getUserById } from '@/services/user.service';
import { getQuotaHistories } from '@/services/quota.service';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/utils';
import { History } from 'lucide-react';

export default async function UserProfilePage() {
  const session = await getSession();
  if (!session) return null;

  const user = await getUserById(session.id);
  const quotaHistories = await getQuotaHistories(session.id);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Profil Saya</h1>
        <p className="text-xs text-slate-500 mt-1">
          Informasi akun karyawan dan riwayat alokasi serta pengurangan kuota cuti Anda.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Account Info */}
        <Card className="lg:col-span-1 border border-slate-200">
          <CardHeader className="text-center pb-6">
            <div className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-2xl mx-auto mb-3 border-2 border-indigo-200">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <CardTitle>{user.name}</CardTitle>
            <p className="text-xs text-slate-500 mt-1">{user.email}</p>
            <div className="mt-3 inline-block">
              <StatusBadge status={user.role} />
            </div>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-semibold">Total Kuota Tahunan</span>
                <span className="font-bold text-slate-900">{user.totalQuota} Hari</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 font-semibold">Kuota Terpakai</span>
                <span className="font-bold text-amber-700">{user.usedQuota} Hari</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-slate-700 font-bold">Sisa Kuota Aktif</span>
                <span className="font-black text-indigo-700 text-sm">{user.remainingQuota} Hari</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quota History Log */}
        <Card className="lg:col-span-2 border border-slate-200 p-0 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="text-base font-semibold text-slate-900">Histori Perubahan Kuota</h3>
              <p className="text-xs text-slate-500">
                Catatan audit penambahan, pengurangan, dan penyesuaian kuota cuti Anda.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Tanggal</th>
                  <th className="px-6 py-3.5">Tipe Perubahan</th>
                  <th className="px-6 py-3.5 text-center">Sebelum</th>
                  <th className="px-6 py-3.5 text-center">Perubahan</th>
                  <th className="px-6 py-3.5 text-center">Sesudah</th>
                  <th className="px-6 py-3.5">Deskripsi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {quotaHistories.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                      Belum ada riwayat perubahan kuota.
                    </td>
                  </tr>
                ) : (
                  quotaHistories.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-500">
                        {formatDateTime(h.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-semibold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {h.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-medium text-slate-700">
                        {h.previousQuota} Hari
                      </td>
                      <td className="px-6 py-4 text-center font-bold">
                        <span
                          className={
                            h.changeAmount > 0
                              ? 'text-emerald-600'
                              : h.changeAmount < 0
                              ? 'text-rose-600'
                              : 'text-slate-600'
                          }
                        >
                          {h.changeAmount > 0 ? `+${h.changeAmount}` : h.changeAmount} Hari
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center font-bold text-slate-900">
                        {h.newQuota} Hari
                      </td>
                      <td className="px-6 py-4 text-slate-800">{h.description}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
