'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Plus, Edit, Trash2, Layers } from 'lucide-react';
import { LeaveCategory, CalculationType } from '@prisma/client';

interface LeaveTypeItem {
  id: string;
  name: string;
  category: LeaveCategory;
  defaultDays?: number | null;
  daysDescription?: string | null;
  calculationType: CalculationType;
}

export default function AdminLeaveTypesPage() {
  const [types, setTypes] = useState<LeaveTypeItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [isOpen, setIsOpen] = useState(false);
  const [editingType, setEditingType] = useState<LeaveTypeItem | null>(null);

  const [formData, setFormData] = useState<{
    name: string;
    category: LeaveCategory;
    defaultDays: string;
    daysDescription: string;
    calculationType: CalculationType;
  }>({
    name: '',
    category: LeaveCategory.CUTI,
    defaultDays: '',
    daysDescription: '',
    calculationType: CalculationType.WORKING_DAYS,
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchTypes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leave-types');
      const json = await res.json();
      if (json.success) {
        setTypes(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTypes();
  }, []);

  const openCreateModal = () => {
    setEditingType(null);
    setFormData({
      name: '',
      category: LeaveCategory.CUTI,
      defaultDays: '',
      daysDescription: '',
      calculationType: CalculationType.WORKING_DAYS,
    });
    setErrorMsg(null);
    setIsOpen(true);
  };

  const openEditModal = (lt: LeaveTypeItem) => {
    setEditingType(lt);
    setFormData({
      name: lt.name,
      category: lt.category,
      defaultDays: lt.defaultDays ? String(lt.defaultDays) : '',
      daysDescription: lt.daysDescription || '',
      calculationType: lt.calculationType,
    });
    setErrorMsg(null);
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const payload = {
        name: formData.name,
        category: formData.category,
        defaultDays: formData.defaultDays ? parseInt(formData.defaultDays) : null,
        daysDescription: formData.daysDescription || null,
        calculationType: formData.calculationType,
      };

      const url = editingType ? `/api/leave-types/${editingType.id}` : '/api/leave-types';
      const method = editingType ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menyimpan jenis cuti');
      }

      setIsOpen(false);
      fetchTypes();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus jenis cuti "${name}"?`)) return;

    try {
      const res = await fetch(`/api/leave-types/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menghapus jenis cuti');
      }
      fetchTypes();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Master Data Jenis Cuti & Izin
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Pengaturan daftar jenis cuti, izin meninggalkan kerja, serta metode perhitungan harinya.
          </p>
        </div>
        <Button onClick={openCreateModal} size="md">
          <Plus className="w-4 h-4" /> + Tambah Jenis Cuti
        </Button>
      </div>

      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Nama Jenis Cuti / Izin</th>
                <th className="px-6 py-3.5">Kategori</th>
                <th className="px-6 py-3.5">Metode Perhitungan</th>
                <th className="px-6 py-3.5">Ket. Jatah / Durasi</th>
                <th className="px-6 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    Memuat jenis cuti...
                  </td>
                </tr>
              ) : types.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                    Belum ada jenis cuti terdaftar.
                  </td>
                </tr>
              ) : (
                types.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-slate-900">{t.name}</td>
                    <td className="px-6 py-4 font-semibold">
                      <span
                        className={`px-2.5 py-1 rounded border ${
                          t.category === 'CUTI'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {t.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-700">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          t.calculationType === 'WORKING_DAYS'
                            ? 'bg-slate-100 text-slate-700 border border-slate-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {t.calculationType === 'WORKING_DAYS' ? 'Hari Kerja (Mon-Fri)' : 'Hari Kalender'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-700 font-medium">
                      {t.daysDescription || (t.defaultDays ? `${t.defaultDays} Hari` : '-')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditModal(t)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(t.id, t.name)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Hapus"
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

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingType ? 'Edit Jenis Cuti' : 'Tambah Jenis Cuti Master'}
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
              {errorMsg}
            </div>
          )}

          <Input
            label="Nama Jenis Cuti / Izin"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Cuti Tahunan, Pernikahan Pekerja, dsb."
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Kategori</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as LeaveCategory })}
                className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="CUTI">CUTI</option>
                <option value="IZIN_MENINGGALKAN">IZIN_MENINGGALKAN</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Metode Perhitungan</label>
              <select
                value={formData.calculationType}
                onChange={(e) =>
                  setFormData({ ...formData, calculationType: e.target.value as CalculationType })
                }
                className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="WORKING_DAYS">Hari Kerja (Excl Weekend)</option>
                <option value="CALENDAR_DAYS">Hari Kalender (All Days)</option>
              </select>
            </div>
          </div>

          <Input
            label="Default Jatah Hari (Opsional)"
            type="number"
            value={formData.defaultDays}
            onChange={(e) => setFormData({ ...formData, defaultDays: e.target.value })}
            placeholder="Contoh: 3, 45, 90"
          />

          <Input
            label="Keterangan Durasi Display"
            value={formData.daysDescription}
            onChange={(e) => setFormData({ ...formData, daysDescription: e.target.value })}
            placeholder="Contoh: 3 hari kerja / 45 hari kalender"
          />

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Memproses...' : 'Simpan Master Data'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
