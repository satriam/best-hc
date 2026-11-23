import React from 'react';
import { getSession } from '@/lib/auth';
import { getUserById } from '@/services/user.service';
import { getQuotaHistories } from '@/services/quota.service';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/utils';
import { BadgeCheck, Briefcase, Building, History, IdCard, Mail, MailWarning } from 'lucide-react';
import { ProfileEditor } from '@/components/profile/ProfileEditor';

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-800 truncate">{value}</p>
      </div>
    </div>
  );
}

export default async function UserProfilePage() {
  const session = await getSession();
  if (!session) return null;

  const user = await getUserById(session.id);
  const quotaHistories = await getQuotaHistories(session.id);

  if (!user) return null;

  const usedPct =
    user.totalQuota > 0 ? Math.min(100, Math.round((user.usedQuota / user.totalQuota) * 100)) : 0;
  const verified = !!user.emailVerifiedAt;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Profil Saya</h1>
        <p className="text-xs text-slate-500 mt-1">
          Ubah email dan password, serta lihat riwayat kuota cuti Anda. Data lain diubah oleh admin.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Kartu akun */}
        <Card className="p-0 overflow-hidden lg:sticky lg:top-6">
          <div className="h-20 bg-gradient-to-r from-indigo-600 to-violet-600" />
          <div className="px-6 pb-6 -mt-10 text-center">
            <div className="w-20 h-20 rounded-full bg-white text-indigo-700 flex items-center justify-center font-black text-2xl mx-auto ring-4 ring-white shadow-md">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <h2 className="mt-3 text-lg font-bold text-slate-900">{user.name}</h2>
            <div className="mt-2 flex items-center justify-center gap-2 flex-wrap">
              <StatusBadge status={user.role} />
              {verified ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <BadgeCheck className="w-3 h-3" /> Email terverifikasi
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <MailWarning className="w-3 h-3" /> Email belum diverifikasi
                </span>
              )}
            </div>
          </div>

          <div className="px-6 pb-6 space-y-4 text-left">
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow icon={IdCard} label="NIP" value={user.nip} />
            <InfoRow icon={Briefcase} label="Jabatan" value={user.position} />
            <InfoRow icon={Building} label="Unit Kerja" value={user.workUnit} />
          </div>

          <div className="border-t border-slate-100 p-6 bg-slate-50/60">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-600">Sisa Kuota Cuti</span>
              <span className="text-2xl font-black text-indigo-700">
                {user.remainingQuota}
                <span className="text-xs font-semibold text-slate-500"> / {user.totalQuota} hari</span>
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${usedPct}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">Terpakai {user.usedQuota} hari</p>
          </div>
        </Card>

        {/* Form edit */}
        <div className="lg:col-span-2">
          <ProfileEditor email={user.email} emailVerified={verified} />
        </div>
      </div>

      {/* Histori kuota */}
      <Card className="p-0 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Histori Perubahan Kuota</h3>
            <p className="text-xs text-slate-500">
              Catatan penambahan, pengurangan, dan penyesuaian kuota cuti Anda.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3">Tanggal</th>
                <th className="px-6 py-3">Tipe</th>
                <th className="px-6 py-3 text-center">Sebelum</th>
                <th className="px-6 py-3 text-center">Perubahan</th>
                <th className="px-6 py-3 text-center">Sesudah</th>
                <th className="px-6 py-3">Deskripsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {quotaHistories.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                    Belum ada riwayat perubahan kuota.
                  </td>
                </tr>
              ) : (
                quotaHistories.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5 whitespace-nowrap text-slate-500">
                      {formatDateTime(h.createdAt)}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                        {h.type}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-center text-slate-700">{h.previousQuota} hari</td>
                    <td className="px-6 py-3.5 text-center font-bold">
                      <span
                        className={
                          h.changeAmount > 0
                            ? 'text-emerald-600'
                            : h.changeAmount < 0
                            ? 'text-rose-600'
                            : 'text-slate-600'
                        }
                      >
                        {h.changeAmount > 0 ? `+${h.changeAmount}` : h.changeAmount} hari
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-center font-bold text-slate-900">{h.newQuota} hari</td>
                    <td className="px-6 py-3.5 text-slate-700">{h.description}</td>
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
