'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/Badge';
import { UserPlus, Edit, Trash2, Key } from 'lucide-react';
import { Role } from '@prisma/client';

interface UserItem {
  id: string;
  nip?: string;
  position?: string;
  workUnit?: string;
  name: string;
  email: string;
  role: Role;
  gender: 'MALE' | 'FEMALE';
  totalQuota: number;
  usedQuota: number;
  remainingQuota: number;
  createdAt: string;
}

/** Ambil pesan error yang aman dari nilai `unknown` (catch tanpa `any`). */
function toErrorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Terjadi kesalahan. Coba lagi.';
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [resettingUser, setResettingUser] = useState<UserItem | null>(null);

  // Form Inputs
  const [formData, setFormData] = useState({
    nip: '',
    position: '',
    workUnit: '',
    name: '',
    email: '',
    password: '',
    role: 'USER' as Role,
    gender: 'MALE' as 'MALE' | 'FEMALE',
    totalQuota: 12,
  });

  const [newPassword, setNewPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // Muat daftar user; setState hanya terjadi di callback async (pola yang sama
  // dengan halaman daftar SPKL) agar tidak memicu cascading render.
  useEffect(() => {
    let active = true;

    fetch('/api/users')
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        if (json.success) setUsers(json.data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        console.error(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const openCreateModal = () => {
    setFormData({
      nip: '',
      position: '',
      workUnit: '',
      name: '',
      email: '',
      password: '',
      role: 'USER',
      gender: 'MALE',
      totalQuota: 12,
    });
    setSubmitError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (u: UserItem) => {
    setEditingUser(u);
    setFormData({
      nip: u.nip && u.nip !== '-' ? u.nip : '',
      position: u.position && u.position !== '-' ? u.position : '',
      workUnit: u.workUnit && u.workUnit !== '-' ? u.workUnit : '',
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      gender: u.gender || 'MALE',
      totalQuota: u.totalQuota,
    });
    setSubmitError(null);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menambahkan user');
      }

      setIsCreateOpen(false);
      reload();
    } catch (err) {
      setSubmitError(toErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengedit user');
      }

      setEditingUser(null);
      reload();
    } catch (err) {
      setSubmitError(toErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;
    setSubmitError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/users/${resettingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal reset password');
      }

      setResettingUser(null);
      setNewPassword('');
      alert('Password berhasil diperbarui');
    } catch (err) {
      setSubmitError(toErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus user "${name}" beserta seluruh data pengajuan cutinya?`)) return;

    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menghapus user');
      }

      reload();
    } catch (err) {
      alert(toErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Manajemen User Pegawai
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola data pegawai, Nomor Pegawai (NIP), Jabatan / Posisi, Satuan Kerja, hak akses, dan batas kuota cuti.
          </p>
        </div>
        <Button onClick={openCreateModal} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
          <UserPlus className="w-4 h-4" /> Tambah User Pegawai Baru
        </Button>
      </div>

      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Nomor Pegawai (NIP)</th>
                <th className="px-5 py-3.5">Jabatan / Posisi</th>
                <th className="px-5 py-3.5">Nama Pegawai</th>
                <th className="px-5 py-3.5">Satuan Kerja</th>
                <th className="px-5 py-3.5">Email & Gender</th>
                <th className="px-5 py-3.5 text-center">Peran</th>
                <th className="px-5 py-3.5 text-center">Sisa Kuota</th>
                <th className="px-5 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                    Memuat data pegawai...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-slate-400">
                    Belum ada data pegawai.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-slate-900 font-extrabold">
                      {u.nip || '-'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 font-semibold">
                      {u.position || '-'}
                    </td>
                    <td className="px-5 py-3.5 font-bold text-slate-900">
                      {u.name}
                    </td>
                    <td className="px-5 py-3.5 text-slate-700 font-semibold">
                      {u.workUnit || '-'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-900">{u.email}</div>
                      <span className="text-[10px] font-bold text-indigo-700">
                        {u.gender === 'FEMALE' ? 'Perempuan ♀' : 'Laki-laki ♂'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <StatusBadge status={u.role} />
                    </td>
                    <td className="px-5 py-3.5 text-center font-extrabold text-indigo-900">
                      {u.remainingQuota} Hari
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center space-x-1.5">
                        <button
                          onClick={() => openEditModal(u)}
                          title="Edit User"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-indigo-600 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setResettingUser(u);
                            setNewPassword('');
                            setSubmitError(null);
                          }}
                          title="Reset Password"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-amber-600 transition-colors"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id, u.name)}
                          title="Hapus Permanen"
                          className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 transition-colors"
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

      {/* Modal Create User */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="👤 Tambah User Pegawai Baru"
        description="Lengkapi Nomor Pegawai, Satuan Kerja, data identitas, dan kuota cuti awal"
      >
        <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
          {submitError && (
            <div className="p-3 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
              ⚠️ {submitError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nomor Pegawai (NIP)</label>
              <Input
                placeholder="Contoh: 199208122020011001"
                value={formData.nip}
                onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Satuan Kerja / Unit Kerja</label>
              <Input
                placeholder="Contoh: Direktorat SDM / Divisi IT"
                value={formData.workUnit}
                onChange={(e) => setFormData({ ...formData, workUnit: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Jabatan / Posisi</label>
            <Input
              placeholder="Contoh: VEGETATION MANAGEMENT SEC. HEAD"
              maxLength={200}
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Dipakai otomatis pada kolom Jabatan di SPKL. Maksimal 200 karakter.
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Nama Lengkap <span className="text-rose-500">*</span></label>
            <Input
              placeholder="Contoh: Budi Santoso"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Email <span className="text-rose-500">*</span></label>
              <Input
                type="email"
                placeholder="budi@besthcm.id"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Password <span className="text-rose-500">*</span></label>
              <Input
                type="password"
                placeholder="Minimal 6 karakter"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Peran System</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="USER">USER (Karyawan)</option>
                <option value="ADMIN">ADMIN (HR Admin)</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Jenis Kelamin</label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'MALE' | 'FEMALE' })}
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="MALE">Laki-laki</option>
                <option value="FEMALE">Perempuan</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Kuota Cuti Tahunan</label>
              <Input
                type="number"
                min={0}
                value={formData.totalQuota}
                onChange={(e) => setFormData({ ...formData, totalQuota: parseInt(e.target.value, 10) || 0 })}
                required
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              {submitting ? 'Menyimpan...' : 'Simpan User Baru'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit User */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title="✏️ Edit Data Pegawai"
        description="Perbarui Nomor Pegawai, Satuan Kerja, atau data profil pegawai"
      >
        <form onSubmit={handleUpdateUser} className="space-y-4 text-xs">
          {submitError && (
            <div className="p-3 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
              ⚠️ {submitError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nomor Pegawai (NIP)</label>
              <Input
                placeholder="Nomor NIP Pegawai"
                value={formData.nip}
                onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Satuan Kerja / Unit Kerja</label>
              <Input
                placeholder="Unit Kerja Pegawai"
                value={formData.workUnit}
                onChange={(e) => setFormData({ ...formData, workUnit: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Jabatan / Posisi</label>
            <Input
              placeholder="Contoh: VEGETATION MANAGEMENT SEC. HEAD"
              maxLength={200}
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Dipakai otomatis pada kolom Jabatan di SPKL. Maksimal 200 karakter.
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Nama Lengkap</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Email</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Password Baru (Opsional)</label>
              <Input
                type="password"
                placeholder="Biarkan kosong jika tidak diubah"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Peran System</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="USER">USER (Karyawan)</option>
                <option value="ADMIN">ADMIN (HR Admin)</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Jenis Kelamin</label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'MALE' | 'FEMALE' })}
                className="w-full h-10 px-3 text-xs rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="MALE">Laki-laki</option>
                <option value="FEMALE">Perempuan</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Kuota Cuti Tahunan</label>
              <Input
                type="number"
                min={0}
                value={formData.totalQuota}
                onChange={(e) => setFormData({ ...formData, totalQuota: parseInt(e.target.value, 10) || 0 })}
                required
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              {submitting ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Reset Password */}
      <Modal
        isOpen={!!resettingUser}
        onClose={() => setResettingUser(null)}
        title="🔑 Reset Password Pegawai"
        description={`Masukkan password baru untuk pegawai ${resettingUser?.name}`}
      >
        <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
          {submitError && (
            <div className="p-3 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
              ⚠️ {submitError}
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">Password Baru</label>
            <Input
              type="password"
              placeholder="Masukkan password baru"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setResettingUser(null)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
              {submitting ? 'Memproses...' : 'Reset Password'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
