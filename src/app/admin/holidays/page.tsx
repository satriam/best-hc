'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { formatDate } from '@/lib/utils';
import { Plus, Trash2, RefreshCw, CalendarDays, DownloadCloud } from 'lucide-react';

interface HolidayItem {
  id: string;
  date: string;
  name: string;
}

export default function AdminHolidaysPage() {
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    name: '',
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const safeParseJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text && text.trim().length > 0 ? JSON.parse(text) : {};
    } catch {
      return { success: false, message: 'Respon tidak valid' };
    }
  };

  const fetchHolidays = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/holidays');
      const json = await safeParseJson(res);
      if (json.success) {
        setHolidays(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const handleSyncApi = async (year: number) => {
    setSyncing(true);
    try {
      const res = await fetch('/api/holidays/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ years: [year] }),
      });
      const json = await safeParseJson(res);
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal sinkronisasi API');
      }
      alert(json.message);
      fetchHolidays();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menambahkan hari libur');
      }

      setIsOpen(false);
      setFormData({
        date: new Date().toISOString().split('T')[0],
        name: '',
      });
      fetchHolidays();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus hari libur "${name}"?`)) return;

    try {
      const res = await fetch(`/api/holidays/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menghapus hari libur');
      }
      fetchHolidays();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Master Tanggal Merah & Libur Nasional
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Data hari libur nasional dan cuti bersama disinkronkan secara otomatis dari API Public Holiday.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => handleSyncApi(2025)}
            disabled={syncing}
            variant="outline"
            size="sm"
            className="border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
          >
            <DownloadCloud className="w-4 h-4" /> Sync API 2025
          </Button>

          <Button
            onClick={() => handleSyncApi(2026)}
            disabled={syncing}
            variant="outline"
            size="sm"
            className="border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
          >
            <DownloadCloud className="w-4 h-4" /> Sync API 2026
          </Button>

          <Button onClick={fetchHolidays} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>

          <Button onClick={() => setIsOpen(true)} size="sm">
            <Plus className="w-4 h-4" /> + Manual
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between text-xs gap-2">
          <span className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-indigo-600" /> Daftar Tanggal Merah Terdaftar ({holidays.length})
          </span>
          <span className="text-slate-500">
            Sumber API: <code className="bg-slate-200/80 px-1.5 py-0.5 rounded text-indigo-900 font-semibold">https://tanggalmerah.upset.dev/api/holidays</code>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Tanggal Libur</th>
                <th className="px-6 py-3.5">Nama Hari Libur / Cuti Bersama</th>
                <th className="px-6 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                    Memuat data tanggal merah...
                  </td>
                </tr>
              ) : holidays.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                    Belum ada hari libur nasional terdaftar. Klik <strong>Sync API 2025/2026</strong> di atas.
                  </td>
                </tr>
              ) : (
                holidays.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-bold text-indigo-900">
                      {formatDate(h.date)}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-800">
                      {h.name}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => handleDelete(h.id, h.name)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Hapus Libur"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Holiday Modal */}
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Tambah Hari Libur Manual"
        description="Masukkan tanggal merah / cuti bersama nasional baru"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Tanggal Libur</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>

          <Input
            label="Nama Hari Libur / Keterangan"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Contoh: Hari Kemerdekaan RI, Cuti Bersama Idul Fitri"
            required
          />

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Memproses...' : 'Simpan Hari Libur'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
