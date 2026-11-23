'use client';

import React, { useMemo, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeatureDef {
  key: string;
  label: string;
  description: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  nip: string | null;
  workUnit: string | null;
  features: string[];
}

export function FeatureMatrix({ users, features }: { users: UserRow[]; features: FeatureDef[] }) {
  const [rows, setRows] = useState(users);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) =>
      [u.name, u.email, u.nip ?? '', u.workUnit ?? ''].some((v) => v.toLowerCase().includes(q))
    );
  }, [rows, query]);

  const save = async (userId: string, next: string[]) => {
    const prev = rows.find((r) => r.id === userId)?.features ?? [];
    setError(null);
    setBusy(userId);
    setRows((rs) => rs.map((r) => (r.id === userId ? { ...r, features: next } : r)));
    try {
      const res = await fetch(`/api/users/${userId}/features`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: next }),
      });
      const r = await res.json();
      if (!res.ok || !r.success) throw new Error(r.message || 'Gagal menyimpan');
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === userId ? { ...r, features: prev } : r)));
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setBusy(null);
    }
  };

  const toggle = (u: UserRow, key: string) =>
    save(u.id, u.features.includes(key) ? u.features.filter((f) => f !== key) : [...u.features, key]);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm shadow-slate-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, email, NIP, unit..."
            className="w-full h-10 pl-9 pr-3 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <p className="text-xs text-slate-500">{filtered.length} user · perubahan tersimpan otomatis</p>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 rounded-lg border bg-rose-50 border-rose-200 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th className="px-6 py-3">User</th>
              <th className="px-6 py-3">Unit Kerja</th>
              {features.map((f) => (
                <th key={f.key} className="px-4 py-3 text-center" title={f.description}>
                  {f.label}
                </th>
              ))}
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={features.length + 3} className="px-6 py-10 text-center text-slate-400">
                  Tidak ada user.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/80">
                  <td className="px-6 py-3.5">
                    <p className="font-semibold text-slate-900">{u.name}</p>
                    <p className="text-[11px] text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-6 py-3.5 text-slate-500">{u.workUnit || '-'}</td>
                  {features.map((f) => {
                    const on = u.features.includes(f.key);
                    return (
                      <td key={f.key} className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={`${f.label} untuk ${u.name}`}
                          disabled={busy === u.id}
                          onClick={() => toggle(u, f.key)}
                          className={cn(
                            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50',
                            on ? 'bg-indigo-600' : 'bg-slate-300'
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex h-4 w-4 items-center justify-center rounded-full bg-white shadow transition-transform',
                              on ? 'translate-x-4' : 'translate-x-0.5'
                            )}
                          >
                            {on && <Check className="w-2.5 h-2.5 text-indigo-600" />}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3.5">
                    {busy === u.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
