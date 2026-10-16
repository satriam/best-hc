'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { RefreshCw, RotateCcw, Sparkles, User, Calendar, CheckCircle2, Edit } from 'lucide-react';

interface UserLeaveQuotaItem {
  id: string;
  userId: string;
  leaveTypeId: string;
  year: number;
  totalQuota: number;
  usedQuota: number;
  borrowedQuota: number;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    gender: string;
  };
  leaveType: {
    id: string;
    name: string;
    category: string;
    defaultDays?: number | null;
    daysDescription?: string | null;
  };
}

interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  gender: string;
}

export default function AdminQuotasPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [userQuotas, setUserQuotas] = useState<UserLeaveQuotaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<any[] | null>(null);

  const [editQuota, setEditQuota] = useState<UserLeaveQuotaItem | null>(null);
  const [editQuotaValue, setEditQuotaValue] = useState<number>(12);
  const [savingEdit, setSavingEdit] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchQuotas = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [resQuotas, resUsers] = await Promise.all([
        fetch(`/api/quotas?year=${selectedYear}`),
        fetch('/api/users'),
      ]);

      const textQuotas = await resQuotas.text();
      const jsonQuotas = textQuotas && textQuotas.trim().length > 0 ? JSON.parse(textQuotas) : {};

      const textUsers = await resUsers.text();
      const jsonUsers = textUsers && textUsers.trim().length > 0 ? JSON.parse(textUsers) : {};

      let userList: UserSummary[] = [];
      if (jsonQuotas.success && jsonQuotas.data && Array.isArray(jsonQuotas.data.users) && jsonQuotas.data.users.length > 0) {
        userList = jsonQuotas.data.users;
      } else if (jsonUsers.success && Array.isArray(jsonUsers.data)) {
        userList = jsonUsers.data.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          gender: u.gender || 'MALE',
        }));
      }

      setUsers(userList);
      if (jsonQuotas.success && jsonQuotas.data) {
        setUserQuotas(jsonQuotas.data.userQuotas || []);
      }
    } catch (err: any) {
      console.error('Error fetching quotas:', err);
      setErrorMsg(err.message || 'Terjadi kesalahan saat memuat data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotas();
  }, [selectedYear]);

  const handleResetAnnual = async () => {
    setResetting(true);
    setResetResult(null);

    try {
      const res = await fetch('/api/quotas/reset-annual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: selectedYear }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mereset kuota tahunan');
      }

      setResetResult(json.data || []);
      fetchQuotas();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setResetting(false);
    }
  };

  const handleOpenQuotaModal = (quota: UserLeaveQuotaItem) => {
    setEditQuota(quota);
    setEditQuotaValue(quota.totalQuota);
  };

  const handleSaveQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editQuota) return;

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/quotas/${editQuota.userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          totalQuota: editQuotaValue,
          year: selectedYear,
          leaveTypeId: editQuota.leaveTypeId,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal memperbarui kuota');
      }

      setEditQuota(null);
      fetchQuotas();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Reset Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Manajemen Multi-Kuota Cuti Karyawan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Lihat, atur, dan edit kuota masing-masing jenis cuti untuk setiap karyawan.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="h-9 px-3 text-xs rounded-lg border border-slate-300 bg-white font-extrabold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
          >
            <option value={2026}>Tahun 2026</option>
            <option value={2027}>Tahun 2027</option>
            <option value={2028}>Tahun 2028</option>
          </select>

          <Button onClick={() => setResetModalOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md" size="sm">
            <RotateCcw className="w-4 h-4" /> Auto Reset Kuota Tahunan
          </Button>

          <Button onClick={fetchQuotas} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Ketentuan Kuota Banner Info */}
      <div className="p-4 rounded-2xl bg-indigo-50/80 border border-indigo-200 space-y-2 text-xs">
        <h4 className="font-extrabold text-indigo-950 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-600" /> Ketentuan Jatah & Kuota Per Jenis Cuti (Dapat Di-edit per Karyawan):
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-slate-700 font-medium">
          <div className="p-2 rounded-lg bg-white border border-indigo-100">📅 <strong>Cuti Tahunan:</strong> Default 12 Hari (Bisa Edit)</div>
          <div className="p-2 rounded-lg bg-white border border-indigo-100">👶 <strong>Cuti Bersalin:</strong> 90 Hari (3 Bulan)</div>
          <div className="p-2 rounded-lg bg-white border border-indigo-100">🏥 <strong>Gugur Kandungan:</strong> 45 Hari</div>
          <div className="p-2 rounded-lg bg-white border border-indigo-100">💒 <strong>Pernikahan Pekerja:</strong> 3 Hari</div>
          <div className="p-2 rounded-lg bg-white border border-indigo-100">💍 <strong>Pernikahan Anak:</strong> 2 Hari</div>
          <div className="p-2 rounded-lg bg-white border border-indigo-100">✂️ <strong>Khitanan / Baptis:</strong> 2 Hari</div>
          <div className="p-2 rounded-lg bg-white border border-indigo-100">🍼 <strong>Istri Melahirkan:</strong> 2 Hari</div>
          <div className="p-2 rounded-lg bg-white border border-indigo-100">🖤 <strong>Keluarga Inti Meninggal:</strong> 2 Hari</div>
          <div className="p-2 rounded-lg bg-white border border-indigo-100">🏠 <strong>Rumah Meninggal:</strong> 1 Hari</div>
          <div className="p-2 rounded-lg bg-white border border-indigo-100">🕌 <strong>Ibadah Keagamaan:</strong> Bebas</div>
          <div className="p-2 rounded-lg bg-white border border-indigo-100">🔄 <strong>Pinjam Cuti:</strong> Potong Cuti Thn Depan</div>
        </div>
      </div>

      {/* User Multi-Quota Cards */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">Memuat data kuota karyawan...</div>
      ) : users.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">Belum ada data karyawan.</div>
      ) : (
        <div className="space-y-6">
          {users.map((u) => {
            const userQuotasList = userQuotas.filter((q) => q.userId === u.id);
            const annualItem = userQuotasList.find((q) => q.leaveType.name === 'Cuti Tahunan');

            return (
              <Card key={u.id} className="p-5 border border-slate-200 shadow-sm space-y-4">
                {/* Employee Info Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-900">{u.name}</h3>
                      <p className="text-xs text-slate-500 flex items-center gap-2">
                        <span>{u.email}</span>
                        <span>•</span>
                        <span className="font-semibold text-indigo-900">
                          {u.gender === 'FEMALE' ? 'Perempuan ♀' : 'Laki-laki ♂'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={() => annualItem && handleOpenQuotaModal(annualItem)}
                    variant="outline"
                    size="sm"
                    className="border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-bold"
                  >
                    <Edit className="w-3.5 h-3.5" /> Edit Kuota Tahunan ({annualItem ? annualItem.totalQuota : 12} Hari)
                  </Button>
                </div>

                {/* Quota Grid per Leave Type for this User */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {userQuotasList.map((q) => {
                    const isUnlimited = q.totalQuota >= 999;
                    const remaining = isUnlimited ? 'Bebas' : q.totalQuota - q.usedQuota;

                    return (
                      <div
                        key={q.id}
                        className={`p-3 rounded-xl border space-y-1.5 ${
                          q.leaveType.name === 'Cuti Tahunan'
                            ? 'bg-indigo-50/90 border-indigo-300 ring-1 ring-indigo-300/40'
                            : 'bg-slate-50 border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-extrabold text-indigo-950 truncate">
                            {q.leaveType.name}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {q.leaveType.name === 'Cuti Tahunan' && (
                              <span className="text-[10px] font-black bg-indigo-600 text-white px-1.5 py-0.5 rounded">
                                Utama
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenQuotaModal(q)}
                              title={`Edit kuota ${q.leaveType.name}`}
                              className="p-1 rounded text-slate-400 hover:text-indigo-700 hover:bg-indigo-100 transition-colors"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-baseline justify-between pt-1 border-t border-slate-200/60">
                          <span className="text-[11px] text-slate-500">Batas: {isUnlimited ? 'Bebas' : `${q.totalQuota} Hari`}</span>
                          <span className="text-xs font-black text-indigo-700">
                            Sisa: {remaining} {isUnlimited ? '' : 'Hari'}
                          </span>
                        </div>

                        {q.usedQuota > 0 && (
                          <div className="text-[10px] text-slate-500 font-semibold">
                            Terpakai: {q.usedQuota} Hari
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Quota Modal */}
      <Modal
        isOpen={!!editQuota}
        onClose={() => setEditQuota(null)}
        title={`✏️ Edit Kuota ${editQuota?.leaveType.name}: ${editQuota?.user.name}`}
        description={`Sesuaikan jatah ${editQuota?.leaveType.name} khusus untuk ${editQuota?.user.name} pada tahun ${selectedYear}`}
      >
        <form onSubmit={handleSaveQuota} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Batas Total Kuota {editQuota?.leaveType.name} (Hari)
            </label>
            <Input
              type="number"
              min={0}
              max={365}
              value={editQuotaValue}
              onChange={(e) => setEditQuotaValue(parseInt(e.target.value, 10) || 0)}
              required
            />
            {editQuota?.leaveType.name === 'Cuti Tahunan' && (
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                💡 Nilai yang Anda tetapkan di sini akan menjadi jatah dasar karyawan ini saat Auto Reset Tahunan dijalankan di masa mendatang.
              </p>
            )}
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setEditQuota(null)}>
              Batal
            </Button>
            <Button
              type="submit"
              disabled={savingEdit}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {savingEdit ? 'Menyimpan...' : 'Simpan Kuota'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Annual Reset Modal */}
      <Modal
        isOpen={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
        title={`🔄 Auto Reset Kuota Tahunan (${selectedYear})`}
        description="Mereset otomatis kuota Cuti Tahunan berdasarkan jatah khusus karyawan & memotong pinjaman cuti tahun sebelumnya"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-700 font-medium leading-relaxed">
            Proses ini akan menjalankan aturan reset otomatis tahunan:
          </p>
          <ul className="list-disc pl-5 text-slate-600 space-y-1 font-medium">
            <li>Mereset kuota **Cuti Tahunan** seluruh karyawan sesuai jatah masing-masing untuk tahun <strong>{selectedYear}</strong>.</li>
            <li>Jika karyawan memiliki pemakaian **Pinjam Cuti** pada tahun sebelumnya, sisa kuota tahun baru akan otomatis dikurangi dari jatah masing-masing.</li>
            <li>Membuat catatan histori audit log secara otomatis.</li>
          </ul>

          {resetResult && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
              <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Reset Berhasil Dijalankan!
              </span>
              <p className="text-[11px]">Auto-reset kuota untuk {resetResult.length} karyawan telah selesai diproses.</p>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setResetModalOpen(false)}>
              Tutup
            </Button>
            <Button
              type="button"
              disabled={resetting}
              onClick={handleResetAnnual}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {resetting ? 'Memproses Reset...' : 'Jalankan Auto Reset'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
