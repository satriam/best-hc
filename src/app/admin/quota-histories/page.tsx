'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/utils';
import { History, RefreshCw } from 'lucide-react';

interface QuotaHistoryAdminItem {
  id: string;
  previousQuota: number;
  changeAmount: number;
  newQuota: number;
  type: string;
  description: string;
  createdAt: string;
  user: {
    name: string;
    email: string;
  };
}

export default function AdminQuotaHistoriesPage() {
  const [histories, setHistories] = useState<QuotaHistoryAdminItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistories = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quota-histories');
      const json = await res.json();
      if (json.success) {
        setHistories(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistories();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Audit Log Histori Kuota
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Catatan log transaksi komprehensif atas seluruh perubahan kuota cuti karyawan.
          </p>
        </div>
        <Button onClick={fetchHistories} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4" /> Refresh Audit Log
        </Button>
      </div>

      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Waktu Transaksi</th>
                <th className="px-6 py-3.5">Nama User</th>
                <th className="px-6 py-3.5">Tipe Transaksi</th>
                <th className="px-6 py-3.5 text-center">Sebelum</th>
                <th className="px-6 py-3.5 text-center">Perubahan</th>
                <th className="px-6 py-3.5 text-center">Sesudah</th>
                <th className="px-6 py-3.5">Deskripsi Audit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    Memuat log histori kuota...
                  </td>
                </tr>
              ) : histories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    Belum ada histori transaksi kuota.
                  </td>
                </tr>
              ) : (
                histories.map((h) => (
                  <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-500">
                      {formatDateTime(h.createdAt)}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {h.user.name}
                      <span className="block text-[11px] font-normal text-slate-500">{h.user.email}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[11px]">
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
                    <td className="px-6 py-4 text-center font-black text-slate-900">
                      {h.newQuota} Hari
                    </td>
                    <td className="px-6 py-4 text-slate-800 font-medium">{h.description}</td>
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
