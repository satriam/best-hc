'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { apiErrorMessage } from '@/components/spkl/spkl-ui';
import { UserMultiSelect } from '@/components/spkl/UserMultiSelect';
import type {
  CutiSigner,
  CutiSignerRoleValue,
  CutiSignerUserOption as UserOption,
} from '@/components/cuti-signer/types';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  UserCog,
} from 'lucide-react';

interface SignerFormState {
  role: CutiSignerRoleValue;
  name: string;
  nip: string;
  position: string;
  department: string;
  workUnit: string;
  /** Satu penanda tangan boleh terhubung ke banyak user akun. */
  userIds: string[];
  isDefault: boolean;
  isActive: boolean;
  sortOrder: string;
}

/** Ringkasan penanda tangan SPKL yang bisa disalin (GET /api/spkl-signers). */
interface SpklSourceSigner {
  id: string;
  role: 'PIC' | 'APPROVER';
  name: string;
  nip: string | null;
  position: string | null;
  department: string | null;
  workUnit: string | null;
}

/** Default pemetaan role SPKL → role cuti: PIC → Mengetahui, Penyetuju → Menyetujui. */
const mapSpklRole = (role: 'PIC' | 'APPROVER'): CutiSignerRoleValue =>
  role === 'PIC' ? 'KNOWING' : 'APPROVER';

const EMPTY_FORM: SignerFormState = {
  role: 'KNOWING',
  name: '',
  nip: '',
  position: '',
  department: '',
  workUnit: '',
  userIds: [],
  isDefault: false,
  isActive: true,
  sortOrder: '0',
};

/** Muat master penanda tangan (termasuk nonaktif) + daftar user (tanpa menyentuh state). */
async function fetchSignersAndUsers(): Promise<{ signers: CutiSigner[]; users: UserOption[] }> {
  const [signerRes, userRes] = await Promise.all([
    fetch('/api/cuti-signers?active=0'),
    fetch('/api/users'),
  ]);
  const signerJson = await signerRes.json();
  if (!signerRes.ok || !signerJson.success) {
    throw new Error(signerJson.message || 'Gagal memuat master penanda tangan');
  }

  const userJson = await userRes.json();
  const users: UserOption[] =
    userRes.ok && userJson.success && Array.isArray(userJson.data)
      ? (userJson.data as UserOption[])
      : [];

  return {
    signers: Array.isArray(signerJson.data) ? (signerJson.data as CutiSigner[]) : [],
    users,
  };
}

export default function CutiSignersPage() {
  const [signers, setSigners] = useState<CutiSigner[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<CutiSignerRoleValue>('KNOWING');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CutiSigner | null>(null);
  const [form, setForm] = useState<SignerFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Salin dari penanda tangan SPKL
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyLoading, setCopyLoading] = useState(false);
  const [copySaving, setCopySaving] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [spklSources, setSpklSources] = useState<SpklSourceSigner[]>([]);
  const [copySelection, setCopySelection] = useState<
    Record<string, { selected: boolean; role: CutiSignerRoleValue }>
  >({});

  useEffect(() => {
    let active = true;

    fetchSignersAndUsers()
      .then((result) => {
        if (!active) return;
        setSigners(result.signers);
        setUsers(result.users);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat master penanda tangan');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const reload = () => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  };

  const visibleSigners = useMemo(
    () => signers.filter((signer) => signer.role === tab),
    [signers, tab]
  );

  const countByRole = useMemo(
    () => ({
      KNOWING: signers.filter((signer) => signer.role === 'KNOWING').length,
      APPROVER: signers.filter((signer) => signer.role === 'APPROVER').length,
    }),
    [signers]
  );

  /**
   * Pilihan user untuk multi-select. User yang sudah terhubung tetapi tidak ada
   * di `users` (mis. GET /api/users gagal) tetap ditampilkan sebagai chip.
   */
  const selectableUsers = useMemo(() => {
    const map = new Map(users.map((user) => [user.id, user] as const));
    (editing?.users ?? []).forEach((link) => {
      if (!map.has(link.userId)) {
        map.set(link.userId, {
          id: link.userId,
          name: link.name,
          email: link.email,
          role: 'USER',
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, editing]);

  /** Ubah tautan user: bantu isi Nama/NIP dari user yang baru ditambahkan bila masih kosong. */
  const handleUserIdsChange = (nextIds: string[]) => {
    const addedId = nextIds.find((id) => !form.userIds.includes(id));
    const added = addedId ? selectableUsers.find((user) => user.id === addedId) : undefined;

    setForm((current) => ({
      ...current,
      userIds: nextIds,
      name: current.name.trim() || added?.name || '',
      nip: current.nip.trim() || added?.nip || '',
    }));
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, role: tab });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (signer: CutiSigner) => {
    setEditing(signer);
    setForm({
      role: signer.role,
      name: signer.name,
      nip: signer.nip ?? '',
      position: signer.position ?? '',
      department: signer.department ?? '',
      workUnit: signer.workUnit ?? '',
      userIds: signer.userIdList ?? (signer.users ?? []).map((user) => user.userId),
      isDefault: signer.isDefault,
      isActive: signer.isActive,
      sortOrder: String(signer.sortOrder ?? 0),
    });
    setFormError(null);
    setModalOpen(true);
  };

  const save = async () => {
    if (form.name.trim().length < 2) {
      setFormError('Nama penanda tangan minimal 2 karakter.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        role: form.role,
        name: form.name.trim(),
        nip: form.nip.trim() || null,
        position: form.position.trim() || null,
        department: form.department.trim() || null,
        workUnit: form.workUnit.trim() || null,
        userIds: form.userIds,
        isDefault: form.isDefault,
        isActive: form.isActive,
        sortOrder: Number(form.sortOrder) || 0,
      };

      const response = await fetch(
        editing ? `/api/cuti-signers/${editing.id}` : '/api/cuti-signers',
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(apiErrorMessage(json, 'Gagal menyimpan penanda tangan'));
      }

      setActionMsg({
        type: 'success',
        text: json.message || (editing ? 'Penanda tangan diperbarui.' : 'Penanda tangan ditambahkan.'),
      });
      setModalOpen(false);
      setEditing(null);
      setReloadToken((token) => token + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan penanda tangan');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (signer: CutiSigner) => {
    const nextActive = !signer.isActive;
    if (
      !confirm(
        nextActive
          ? `Aktifkan kembali ${signer.name}?`
          : `Nonaktifkan ${signer.name}? Penanda tangan tidak dipakai lagi pada cetak cuti berikutnya.`
      )
    ) {
      return;
    }

    setTogglingId(signer.id);
    setActionMsg(null);
    try {
      const response = await fetch(`/api/cuti-signers/${signer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextActive, ...(nextActive ? {} : { isDefault: false }) }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengubah status penanda tangan');
      }
      setActionMsg({
        type: 'success',
        text: nextActive ? `${signer.name} diaktifkan kembali.` : `${signer.name} dinonaktifkan.`,
      });
      setReloadToken((token) => token + 1);
    } catch (err) {
      setActionMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal mengubah status penanda tangan',
      });
    } finally {
      setTogglingId(null);
    }
  };

  /** Buka modal salin: muat penanda tangan SPKL aktif lalu isi pilihan awal. */
  const openCopyFromSpkl = async () => {
    setCopyOpen(true);
    setCopyLoading(true);
    setCopyError(null);
    setSpklSources([]);
    setCopySelection({});
    try {
      const response = await fetch('/api/spkl-signers?active=1');
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(apiErrorMessage(json, 'Gagal memuat penanda tangan SPKL'));
      }
      const list: SpklSourceSigner[] = Array.isArray(json.data)
        ? (json.data as SpklSourceSigner[])
        : [];
      setSpklSources(list);
      setCopySelection(
        Object.fromEntries(
          list.map((signer) => [
            signer.id,
            { selected: false, role: mapSpklRole(signer.role) },
          ])
        )
      );
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Gagal memuat penanda tangan SPKL');
    } finally {
      setCopyLoading(false);
    }
  };

  const copySelectedCount = Object.values(copySelection).filter((row) => row.selected).length;

  const toggleCopyRow = (id: string) =>
    setCopySelection((current) => ({
      ...current,
      [id]: { ...current[id], selected: !current[id]?.selected, role: current[id]?.role ?? 'KNOWING' },
    }));

  const setCopyRowRole = (id: string, role: CutiSignerRoleValue) =>
    setCopySelection((current) => ({
      ...current,
      [id]: { ...current[id], role },
    }));

  const toggleCopyAll = () => {
    const allSelected = spklSources.every((signer) => copySelection[signer.id]?.selected);
    setCopySelection((current) =>
      Object.fromEntries(
        Object.entries(current).map(([id, row]) => [id, { ...row, selected: !allSelected }])
      )
    );
  };

  const submitCopyFromSpkl = async () => {
    const items = Object.entries(copySelection)
      .filter(([, row]) => row.selected)
      .map(([spklSignerId, row]) => ({ spklSignerId, role: row.role }));

    if (items.length === 0) {
      setCopyError('Pilih minimal satu penanda tangan SPKL.');
      return;
    }

    setCopySaving(true);
    setCopyError(null);
    try {
      const response = await fetch('/api/cuti-signers/import-spkl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(apiErrorMessage(json, 'Gagal menyalin penanda tangan dari SPKL'));
      }

      const skipped: Array<{ name: string; reason: string }> = json.data?.skipped ?? [];
      setActionMsg({
        type: 'success',
        text:
          (json.message || 'Penanda tangan disalin.') +
          (skipped.length > 0
            ? ` Dilewati: ${skipped.map((row) => `${row.name} (${row.reason})`).join('; ')}.`
            : ''),
      });
      setCopyOpen(false);
      setReloadToken((token) => token + 1);
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Gagal menyalin penanda tangan dari SPKL');
    } finally {
      setCopySaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-200 shrink-0">
            <UserCog className="w-5 h-5" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Master Penanda Tangan Cuti
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Data penanda tangan Mengetahui & Menyetujui yang dipakai pada blok tanda tangan cetak permohonan cuti.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
          </Button>
          <Button variant="outline" size="sm" onClick={openCopyFromSpkl} disabled={loading}>
            <ArrowRightLeft className="w-3.5 h-3.5" /> Salin dari SPKL
          </Button>
          <Button size="md" onClick={openCreate} className="font-bold">
            <Plus className="w-4 h-4" /> Tambah {tab === 'KNOWING' ? 'Mengetahui' : 'Menyetujui'}
          </Button>
        </div>
      </div>

      {actionMsg && (
        <div
          className={`p-4 rounded-xl border text-xs font-medium ${
            actionMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Tab */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        {(
          [
            { value: 'KNOWING' as CutiSignerRoleValue, label: 'Mengetahui' },
            { value: 'APPROVER' as CutiSignerRoleValue, label: 'Menyetujui' },
          ]
        ).map((item) => {
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={`px-4 py-2.5 text-xs font-bold border-b-2 -mb-px transition-colors ${
                active
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.label}
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                {countByRole[item.value]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tabel */}
      <Card className="p-0 overflow-hidden border border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs text-slate-600">
            <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Nama</th>
                <th className="px-4 py-3.5">NIP</th>
                <th className="px-4 py-3.5">Jabatan</th>
                <th className="px-4 py-3.5">Satuan Kerja</th>
                <th className="px-4 py-3.5">Terhubung User</th>
                <th className="px-4 py-3.5 text-center">Default</th>
                <th className="px-4 py-3.5 text-center">Aktif</th>
                <th className="px-4 py-3.5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-400">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Memuat master penanda tangan...
                    </span>
                  </td>
                </tr>
              ) : visibleSigners.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <span className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
                        <UserCog className="w-6 h-6" />
                      </span>
                      <p className="text-sm font-bold text-slate-700">
                        Belum ada {tab === 'KNOWING' ? 'Mengetahui' : 'Menyetujui'} terdaftar.
                      </p>
                      <Button size="sm" onClick={openCreate} className="mt-1">
                        <Plus className="w-4 h-4" /> Tambah sekarang
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleSigners.map((signer) => (
                  <tr
                    key={signer.id}
                    className={`transition-colors ${
                      signer.isActive ? 'hover:bg-slate-50/80' : 'bg-slate-50/60 text-slate-400'
                    }`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{signer.name}</p>
                      {signer.department && (
                        <p className="text-[10px] text-slate-500 truncate max-w-[220px]">
                          {signer.department}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 font-mono text-[11px]">{signer.nip || '—'}</td>
                    <td className="px-4 py-4 max-w-[220px]">{signer.position || '—'}</td>
                    <td className="px-4 py-4">{signer.workUnit || '—'}</td>
                    <td className="px-4 py-4">
                      {signer.users.length > 0 ? (
                        <div className="space-y-1">
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200"
                            title={signer.users.map((user) => `${user.name} <${user.email}>`).join('\n')}
                          >
                            {signer.users.length} user
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {signer.users.slice(0, 2).map((user) => (
                              <span
                                key={user.userId}
                                title={user.email}
                                className="max-w-[140px] truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                              >
                                {user.name}
                              </span>
                            ))}
                            {signer.users.length > 2 && (
                              <span
                                className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500"
                                title={signer.users
                                  .slice(2)
                                  .map((user) => user.name)
                                  .join(', ')}
                              >
                                +{signer.users.length - 2}
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {signer.isDefault ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                          <CheckCircle2 className="w-3 h-3" /> Default
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                          signer.isActive
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}
                      >
                        {signer.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(signer)}
                          title="Edit penanda tangan"
                          aria-label={`Edit ${signer.name}`}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(signer)}
                          disabled={togglingId === signer.id}
                          title={signer.isActive ? 'Nonaktifkan' : 'Aktifkan kembali'}
                          aria-label={`${signer.isActive ? 'Nonaktifkan' : 'Aktifkan'} ${signer.name}`}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                            signer.isActive
                              ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                              : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                        >
                          {togglingId === signer.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Power className="w-4 h-4" />
                          )}
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

      <div className="flex items-start gap-2 p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 text-[11px] text-indigo-900">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          Hanya satu penanda tangan yang bisa menjadi <strong>default</strong> per role — mencentang
          default pada satu baris otomatis melepas default baris lain di role yang sama. Penanda
          tangan default inilah yang tercetak pada blok tanda tangan <strong>Mengetahui</strong> dan
          <strong>Menyetujui</strong> di permohonan cuti. Satu penanda tangan bisa terhubung ke
          <strong>banyak user</strong> akun.
        </p>
      </div>

      {/* Modal form */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : `Tambah ${form.role === 'KNOWING' ? 'Mengetahui' : 'Menyetujui'}`}
        description="Data ini muncul pada blok tanda tangan hasil cetak permohonan cuti."
        maxWidth="xl"
      >
        <div className="space-y-3">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="signer-role" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Role
              </label>
              <select
                id="signer-role"
                value={form.role}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as CutiSignerRoleValue,
                  }))
                }
                className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="KNOWING">Mengetahui</option>
                <option value="APPROVER">Menyetujui</option>
              </select>
            </div>
            <Input
              label="Nama *"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Nama lengkap"
            />
            <Input
              label="NIP"
              value={form.nip}
              onChange={(event) => setForm((current) => ({ ...current, nip: event.target.value }))}
              placeholder="7796130645"
            />
            <Input
              label="Satuan Kerja"
              value={form.workUnit}
              onChange={(event) => setForm((current) => ({ ...current, workUnit: event.target.value }))}
              placeholder="FMWR"
            />
            <Input
              label="Jabatan"
              value={form.position}
              onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))}
              placeholder="VEGETATION MANAGEMENT SEC. HEAD"
            />
            <Input
              label="Departemen"
              value={form.department}
              onChange={(event) =>
                setForm((current) => ({ ...current, department: event.target.value }))
              }
              placeholder="FORESTRY MGMT & WATERSHED REH DEPT. HEAD"
            />
            <div className="sm:col-span-2">
              <label htmlFor="signer-user" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Terhubung User (opsional — bisa lebih dari satu)
              </label>
              <UserMultiSelect
                inputId="signer-user"
                users={selectableUsers}
                value={form.userIds}
                onChange={handleUserIdsChange}
                placeholder="Cari nama atau email user…"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                Ketik untuk mencari, klik untuk mencentang (boleh lebih dari satu), klik × pada chip
                untuk melepas. Untuk role Menyetujui, semua user terpilih tercatat sebagai pemegang tanda tangan tersebut.
              </p>
            </div>
            <Input
              label="Urutan Tampil"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-1">
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isDefault: event.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="font-semibold">Jadikan default</span>
                <span className="block text-[10px] text-slate-500">
                  Otomatis dipakai saat mencetak permohonan cuti (default lain di role yang sama dilepas).
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({ ...current, isActive: event.target.checked }))
                }
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="font-semibold">Aktif</span>
                <span className="block text-[10px] text-slate-500">
                  Nonaktif tidak dipakai pada cetak permohonan cuti.
                </span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Batal
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Simpan
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal salin dari master SPKL */}
      <Modal
        isOpen={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Salin dari Penanda Tangan SPKL"
        description="Ambil data PIC / Penyetuju SPKL lalu simpan sebagai penanda tangan cuti. Tautan user ikut tersalin."
        maxWidth="xl"
      >
        <div className="space-y-3">
          {copyError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {copyError}
            </div>
          )}

          {copyLoading ? (
            <div className="py-8 text-center text-xs text-slate-500">
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Memuat penanda tangan SPKL...
              </span>
            </div>
          ) : spklSources.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              Belum ada penanda tangan SPKL aktif untuk disalin.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={toggleCopyAll}
                  className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900"
                >
                  {spklSources.every((signer) => copySelection[signer.id]?.selected)
                    ? 'Batal pilih semua'
                    : 'Pilih semua'}
                </button>
                <span className="text-[11px] text-slate-500">{copySelectedCount} dipilih</span>
              </div>

              <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {spklSources.map((signer) => {
                  const row = copySelection[signer.id] ?? { selected: false, role: mapSpklRole(signer.role) };
                  return (
                    <div
                      key={signer.id}
                      className={`flex items-center gap-3 p-3 ${row.selected ? 'bg-indigo-50/50' : 'bg-white'}`}
                    >
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() => toggleCopyRow(signer.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`Pilih ${signer.name}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">{signer.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {signer.nip ? `NIP ${signer.nip} · ` : ''}
                          {signer.position || 'Jabatan belum diisi'}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                          signer.role === 'PIC'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        SPKL: {signer.role === 'PIC' ? 'PIC' : 'Penyetuju'}
                      </span>
                      <select
                        value={row.role}
                        onChange={(event) =>
                          setCopyRowRole(signer.id, event.target.value as CutiSignerRoleValue)
                        }
                        disabled={!row.selected}
                        aria-label={`Role cuti untuk ${signer.name}`}
                        className="h-8 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-[11px] text-slate-900 disabled:opacity-50"
                      >
                        <option value="KNOWING">Mengetahui</option>
                        <option value="APPROVER">Menyetujui</option>
                      </select>
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-slate-500">
                Role tujuan bisa diubah per baris (default: PIC → Mengetahui, Penyetuju → Menyetujui).
                Data yang sudah ada di master cuti dengan role + NIP/nama sama akan dilewati. Bila role
                tujuan belum punya default, baris pertama yang disalin otomatis jadi default.
              </p>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setCopyOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              onClick={submitCopyFromSpkl}
              disabled={copySaving || copyLoading || copySelectedCount === 0}
            >
              {copySaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="w-4 h-4" />
              )}
              Salin {copySelectedCount > 0 ? `${copySelectedCount} data` : ''}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}