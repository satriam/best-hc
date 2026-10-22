'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import {
  RefreshCw,
  RotateCcw,
  Sparkles,
  User,
  CheckCircle2,
  Edit,
  Upload,
  AlertTriangle,
  Loader2,
  XCircle,
} from 'lucide-react';

/** Mode input admin untuk satu baris kuota. */
type QuotaMode = 'TOTAL' | 'USED' | 'REMAINING';
/** Mode data yang dimiliki admin pada sinkronisasi massal. */
type SyncMode = 'REMAINING' | 'USED';

const QUOTA_MODE_LABEL: Record<QuotaMode, string> = {
  TOTAL: 'Jatah',
  USED: 'Terpakai',
  REMAINING: 'Sisa',
};

const SYNC_MODE_LABEL: Record<SyncMode, string> = {
  REMAINING: 'Saya tahu SISA',
  USED: 'Saya tahu TERPAKAI',
};

interface UserLeaveQuotaItem {
  id: string;
  userId: string;
  leaveTypeId: string;
  year: number;
  totalQuota: number;
  usedQuota: number;
  borrowedQuota: number;
  remainingQuota?: number;
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

interface LeaveTypeSummary {
  id: string;
  name: string;
  category?: string;
  defaultDays?: number | null;
}

interface QuotaIndexEntry {
  userName: string;
  totalQuota: number;
  usedQuota: number;
  remainingQuota: number;
}

interface SyncPreviewRow {
  line: number;
  email: string;
  valueRaw: string;
  value: number | null;
  user: UserSummary | null;
  current: QuotaIndexEntry | null;
  after: { totalQuota: number; usedQuota: number; remainingQuota: number } | null;
  errors: string[];
}

interface ResetResultRow {
  userId: string;
  name: string;
  userEntitlement: number;
  borrowedDays: number;
  newAnnualTotal: number;
}

interface ToastState {
  type: 'success' | 'error';
  message: string;
}

function remainingOf(quota: { totalQuota: number; usedQuota: number; remainingQuota?: number }): number {
  return typeof quota.remainingQuota === 'number' ? quota.remainingQuota : quota.totalQuota - quota.usedQuota;
}

function isUnlimitedQuota(totalQuota: number): boolean {
  return totalQuota >= 999;
}

/** Warna badge sisa: 0 = merah, <= 2 = amber, lainnya hijau. */
function remainingBadgeClass(remaining: number, unlimited: boolean): string {
  if (unlimited) return 'bg-indigo-100 text-indigo-800 border-indigo-200';
  if (remaining <= 0) return 'bg-rose-100 text-rose-700 border-rose-200';
  if (remaining <= 2) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-emerald-100 text-emerald-700 border-emerald-200';
}

/**
 * Parse input massal `email<TAB>nilai` atau `email,nilai` (satu baris satu
 * karyawan) lalu hitung pratinjau sebelum dikirim ke server.
 */
function parseSyncInput(
  text: string,
  mode: SyncMode,
  leaveTypeId: string,
  index: Record<string, QuotaIndexEntry>,
  users: UserSummary[]
): SyncPreviewRow[] {
  const emailToUser = new Map(users.map((u) => [u.email.trim().toLowerCase(), u]));
  const firstLineByEmail = new Map<string, number>();
  const rows: SyncPreviewRow[] = [];

  text.split(/\r?\n/).forEach((rawLine, i) => {
    if (!rawLine.trim()) return;

    const tabIndex = rawLine.indexOf('\t');
    const commaIndex = rawLine.indexOf(',');
    const sepIndex = tabIndex >= 0 ? tabIndex : commaIndex;
    const email = (sepIndex >= 0 ? rawLine.slice(0, sepIndex) : rawLine).trim();
    const valueRaw = sepIndex >= 0 ? rawLine.slice(sepIndex + 1).trim() : '';
    const line = i + 1;
    const errors: string[] = [];

    if (sepIndex < 0) {
      errors.push('format harus email<TAB>nilai atau email,nilai');
    }
    if (!email) {
      errors.push('email kosong');
    }

    const emailLower = email.toLowerCase();
    const user = emailLower ? emailToUser.get(emailLower) ?? null : null;
    if (emailLower && !user) {
      errors.push('email tidak dikenal');
    }

    if (emailLower) {
      const firstLine = firstLineByEmail.get(emailLower);
      if (firstLine !== undefined) {
        errors.push(`email duplikat dengan baris ${firstLine}`);
      } else {
        firstLineByEmail.set(emailLower, line);
      }
    }

    let value: number | null = null;
    if (!valueRaw) {
      errors.push('nilai kosong');
    } else if (!/^\d+$/.test(valueRaw)) {
      errors.push('nilai bukan angka bulat');
    } else {
      value = parseInt(valueRaw, 10);
    }

    const current = emailLower && leaveTypeId ? index[`${emailLower}|${leaveTypeId}`] ?? null : null;
    if (user && leaveTypeId && !current) {
      errors.push('data kuota belum tersedia untuk jenis cuti ini');
    }

    let after: SyncPreviewRow['after'] = null;
    if (value !== null && current) {
      if (value > current.totalQuota) {
        errors.push(
          mode === 'REMAINING'
            ? `sisa ${value} melebihi jatah ${current.totalQuota} hari`
            : `terpakai ${value} melebihi jatah ${current.totalQuota} hari`
        );
      } else if (mode === 'REMAINING') {
        after = {
          totalQuota: current.totalQuota,
          usedQuota: current.totalQuota - value,
          remainingQuota: value,
        };
      } else {
        after = {
          totalQuota: current.totalQuota,
          usedQuota: value,
          remainingQuota: current.totalQuota - value,
        };
      }
    }

    rows.push({ line, email, valueRaw, value, user, current, after, errors });
  });

  return rows;
}

export default function AdminQuotasPage() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [userQuotas, setUserQuotas] = useState<UserLeaveQuotaItem[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [toast, setToast] = useState<ToastState | null>(null);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<ResetResultRow[] | null>(null);

  const [editQuota, setEditQuota] = useState<UserLeaveQuotaItem | null>(null);
  const [editMode, setEditMode] = useState<QuotaMode>('TOTAL');
  const [editValueInput, setEditValueInput] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [syncOpen, setSyncOpen] = useState(false);
  const [syncYear, setSyncYear] = useState<number>(new Date().getFullYear());
  const [syncLeaveTypeId, setSyncLeaveTypeId] = useState<string>('');
  const [syncMode, setSyncMode] = useState<SyncMode>('REMAINING');
  const [syncText, setSyncText] = useState<string>('');
  const [syncIndex, setSyncIndex] = useState<Record<string, QuotaIndexEntry>>({});
  const [syncIndexLoading, setSyncIndexLoading] = useState(false);
  const [syncSubmitting, setSyncSubmitting] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncRowErrors, setSyncRowErrors] = useState<Record<number, string>>({});
  const [syncResult, setSyncResult] = useState<{ applied: number; skipped: number } | null>(null);

  const fetchQuotas = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [resQuotas, resUsers, resLeaveTypes] = await Promise.all([
        fetch(`/api/quotas?year=${selectedYear}`),
        fetch('/api/users'),
        fetch('/api/leave-types'),
      ]);

      const textQuotas = await resQuotas.text();
      const jsonQuotas = textQuotas && textQuotas.trim().length > 0 ? JSON.parse(textQuotas) : {};

      const textUsers = await resUsers.text();
      const jsonUsers = textUsers && textUsers.trim().length > 0 ? JSON.parse(textUsers) : {};

      const textLeaveTypes = await resLeaveTypes.text();
      const jsonLeaveTypes =
        textLeaveTypes && textLeaveTypes.trim().length > 0 ? JSON.parse(textLeaveTypes) : {};

      let userList: UserSummary[] = [];
      if (
        jsonQuotas.success &&
        jsonQuotas.data &&
        Array.isArray(jsonQuotas.data.users) &&
        jsonQuotas.data.users.length > 0
      ) {
        userList = jsonQuotas.data.users;
      } else if (jsonUsers.success && Array.isArray(jsonUsers.data)) {
        userList = jsonUsers.data.map((u: UserSummary) => ({
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
      if (jsonLeaveTypes.success && Array.isArray(jsonLeaveTypes.data)) {
        setLeaveTypes(
          jsonLeaveTypes.data.map((lt: LeaveTypeSummary) => ({
            id: lt.id,
            name: lt.name,
            category: lt.category,
            defaultDays: lt.defaultDays,
          }))
        );
      }
    } catch (err) {
      console.error('Error fetching quotas:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat data');
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      await Promise.resolve();
      if (!cancelled) await fetchQuotas();
    };
    void start();
    return () => {
      cancelled = true;
    };
  }, [fetchQuotas]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

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
    } catch (err) {
      setToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mereset kuota tahunan',
      });
    } finally {
      setResetting(false);
    }
  };

  const handleOpenQuotaModal = (quota: UserLeaveQuotaItem) => {
    setEditQuota(quota);
    setEditMode('TOTAL');
    setEditValueInput(String(quota.totalQuota));
    setEditError(null);
  };

  const editCurrent = editQuota
    ? {
        totalQuota: editQuota.totalQuota,
        usedQuota: editQuota.usedQuota,
        remainingQuota: remainingOf(editQuota),
      }
    : null;

  const editValueNumber = editValueInput.trim() === '' ? null : Number(editValueInput);
  const editValueValid =
    editValueNumber !== null && Number.isInteger(editValueNumber) && editValueNumber >= 0;

  const handleSaveQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editQuota || !editValueValid || editValueNumber === null) return;

    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/quotas/${editQuota.userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: editMode,
          value: editValueNumber,
          year: selectedYear,
          leaveTypeId: editQuota.leaveTypeId,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal memperbarui kuota');
      }

      const updated = json.data || {};
      setEditQuota(null);
      setToast({
        type: 'success',
        message:
          `Kuota ${editQuota.leaveType.name} ${editQuota.user.name} tersimpan — ` +
          `jatah ${updated.totalQuota ?? editQuota.totalQuota}, terpakai ${updated.usedQuota ?? editQuota.usedQuota}, ` +
          `sisa ${updated.remainingQuota ?? remainingOf(editQuota)} hari.`,
      });
      await fetchQuotas();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Gagal memperbarui kuota');
    } finally {
      setSavingEdit(false);
    }
  };

  const loadSyncIndex = useCallback(async (year: number) => {
    setSyncIndexLoading(true);
    try {
      const res = await fetch(`/api/quotas?year=${year}`);
      const json = await res.json();
      const rows: UserLeaveQuotaItem[] = json?.data?.userQuotas ?? [];
      const nextIndex: Record<string, QuotaIndexEntry> = {};
      rows.forEach((quota) => {
        nextIndex[`${quota.user.email.trim().toLowerCase()}|${quota.leaveTypeId}`] = {
          userName: quota.user.name,
          totalQuota: quota.totalQuota,
          usedQuota: quota.usedQuota,
          remainingQuota: remainingOf(quota),
        };
      });
      setSyncIndex(nextIndex);
    } catch {
      setSyncIndex({});
    } finally {
      setSyncIndexLoading(false);
    }
  }, []);

  const openSyncDialog = () => {
    const annualType = leaveTypes.find((lt) => lt.name === 'Cuti Tahunan');
    setSyncYear(selectedYear);
    setSyncLeaveTypeId(annualType?.id ?? leaveTypes[0]?.id ?? '');
    setSyncMode('REMAINING');
    setSyncText('');
    setSyncError(null);
    setSyncRowErrors({});
    setSyncResult(null);
    setSyncOpen(true);
    loadSyncIndex(selectedYear);
  };

  const syncPreview = useMemo(
    () => parseSyncInput(syncText, syncMode, syncLeaveTypeId, syncIndex, users),
    [syncText, syncMode, syncLeaveTypeId, syncIndex, users]
  );

  const syncInvalidRows = syncPreview.filter((row) => row.errors.length > 0);
  const syncCanApply =
    syncPreview.length > 0 && syncInvalidRows.length === 0 && !syncSubmitting && !syncIndexLoading;

  const handleApplySync = async () => {
    if (!syncCanApply) return;

    setSyncSubmitting(true);
    setSyncError(null);
    setSyncRowErrors({});
    setSyncResult(null);

    try {
      const res = await fetch('/api/quotas/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: syncYear,
          mode: syncMode,
          rows: syncPreview.map((row) => ({
            userEmail: row.email.trim(),
            leaveTypeName: leaveTypes.find((lt) => lt.id === syncLeaveTypeId)?.name,
            value: row.value,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        const rowErrors: Record<number, string> = {};
        if (Array.isArray(json.errors)) {
          json.errors.forEach((item: { row?: number; message?: string }) => {
            if (typeof item?.row === 'number') {
              rowErrors[item.row] = item.message || 'baris tidak valid';
            }
          });
        }
        setSyncRowErrors(rowErrors);
        throw new Error(json.message || 'Gagal menyinkronkan kuota');
      }

      setSyncResult({ applied: json.applied ?? 0, skipped: json.skipped ?? 0 });
      setToast({
        type: 'success',
        message: `Sinkronisasi kuota selesai: ${json.applied ?? 0} baris diperbarui, ${
          json.skipped ?? 0
        } dilewati (nilai sama).`,
      });
      await fetchQuotas();
      await loadSyncIndex(syncYear);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Gagal menyinkronkan kuota');
    } finally {
      setSyncSubmitting(false);
    }
  };

  const syncLeaveTypeName = leaveTypes.find((lt) => lt.id === syncLeaveTypeId)?.name ?? '-';

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Manajemen Multi-Kuota Cuti Karyawan
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Lihat, atur, dan edit kuota masing-masing jenis cuti untuk setiap karyawan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="h-9 px-3 text-xs rounded-lg border border-slate-300 bg-white font-extrabold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
          >
            <option value={2026}>Tahun 2026</option>
            <option value={2027}>Tahun 2027</option>
            <option value={2028}>Tahun 2028</option>
          </select>

          <Button
            onClick={openSyncDialog}
            variant="outline"
            size="sm"
            className="border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-bold"
            data-testid="open-sync-dialog"
          >
            <Upload className="w-4 h-4" /> Sinkronisasi
          </Button>

          <Button
            onClick={() => setResetModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md"
            size="sm"
          >
            <RotateCcw className="w-4 h-4" /> Auto Reset Kuota Tahunan
          </Button>

          <Button onClick={fetchQuotas} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* Notifikasi hasil aksi (toast inline) */}
      {toast && (
        <div
          role="status"
          data-testid="quota-toast"
          className={`p-3 rounded-xl border flex items-start gap-2 text-xs font-semibold ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          ) : (
            <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span className="leading-relaxed">{toast.message}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

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
              <Card key={u.id} className="p-5 border border-slate-200 shadow-sm space-y-4" data-testid={`quota-user-${u.id}`}>
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
                    const unlimited = isUnlimitedQuota(q.totalQuota);
                    const remaining = remainingOf(q);

                    return (
                      <div
                        key={q.id}
                        data-testid={`quota-card-${q.leaveTypeId}`}
                        data-total={q.totalQuota}
                        data-used={q.usedQuota}
                        data-remaining={remaining}
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
                              aria-label={`Edit kuota ${q.leaveType.name} ${q.user.name}`}
                              className="p-1 rounded text-slate-400 hover:text-indigo-700 hover:bg-indigo-100 transition-colors"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-200/60">
                          <div>
                            <div className="text-[9px] uppercase tracking-wide text-slate-400 font-bold">Jatah</div>
                            <div className="text-xs font-extrabold text-slate-800">
                              {unlimited ? 'Bebas' : `${q.totalQuota}`}
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] uppercase tracking-wide text-slate-400 font-bold">Terpakai</div>
                            <div className="text-xs font-extrabold text-slate-800">
                              {unlimited ? '—' : `${q.usedQuota}`}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] uppercase tracking-wide text-slate-400 font-bold">Sisa</div>
                            <span
                              className={`inline-flex items-center justify-center min-w-6 px-1.5 py-0.5 rounded border text-xs font-black ${remainingBadgeClass(
                                remaining,
                                unlimited
                              )}`}
                            >
                              {unlimited ? 'Bebas' : remaining}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ================= Modal Edit Kuota (3 mode) ================= */}
      <Modal
        isOpen={!!editQuota}
        onClose={() => setEditQuota(null)}
        title={`✏️ Edit Kuota ${editQuota?.leaveType.name ?? ''}`}
        description={`${editQuota?.user.name ?? ''} • tahun ${selectedYear}`}
      >
        <form onSubmit={handleSaveQuota} className="space-y-4 text-xs">
          {/* Konteks kuota saat ini */}
          {editCurrent && (
            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Jatah</div>
                <div className="text-sm font-black text-slate-800">{editCurrent.totalQuota}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Terpakai</div>
                <div className="text-sm font-black text-slate-800">{editCurrent.usedQuota}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Sisa</div>
                <div className="text-sm font-black text-indigo-700">{editCurrent.remainingQuota}</div>
              </div>
            </div>
          )}

          {/* Pemilih mode */}
          <div>
            <label className="block font-bold text-slate-700 mb-1.5">Data yang saya isi</label>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200" role="group" aria-label="Mode edit kuota">
              {(['TOTAL', 'USED', 'REMAINING'] as QuotaMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={editMode === mode}
                  data-testid={`edit-mode-${mode.toLowerCase()}`}
                  onClick={() => {
                    setEditMode(mode);
                    setEditError(null);
                    if (editCurrent) {
                      const preset =
                        mode === 'TOTAL'
                          ? editCurrent.totalQuota
                          : mode === 'USED'
                            ? editCurrent.usedQuota
                            : editCurrent.remainingQuota;
                      setEditValueInput(String(preset));
                    }
                  }}
                  className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    editMode === mode
                      ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {QUOTA_MODE_LABEL[mode]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              {editMode === 'TOTAL'
                ? `Jatah Total ${editQuota?.leaveType.name ?? ''} (Hari)`
                : editMode === 'USED'
                  ? `Jumlah Terpakai ${editQuota?.leaveType.name ?? ''} (Hari)`
                  : `Sisa ${editQuota?.leaveType.name ?? ''} (Hari)`}
            </label>
            <Input
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              value={editValueInput}
              data-testid="edit-quota-input"
              onChange={(e) => {
                setEditValueInput(e.target.value);
                setEditError(null);
              }}
              required
            />

            {/* Helper text dinamis */}
            {editCurrent && editValueValid && editValueNumber !== null && (
              <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed font-medium" data-testid="edit-helper">
                {editMode === 'TOTAL' && (
                  <>
                    Jatah baru <strong>{editValueNumber}</strong> − terpakai <strong>{editCurrent.usedQuota}</strong> ={' '}
                    <strong className={editValueNumber - editCurrent.usedQuota < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                      Sisa {editValueNumber - editCurrent.usedQuota} hari
                    </strong>
                    {editValueNumber - editCurrent.usedQuota < 0 && (
                      <span className="block text-rose-600 font-semibold">
                        ⚠️ Jatah lebih kecil dari terpakai — sisa menjadi negatif.
                      </span>
                    )}
                  </>
                )}
                {editMode === 'USED' && (
                  <>
                    Jatah <strong>{editCurrent.totalQuota}</strong> − terpakai <strong>{editValueNumber}</strong> ={' '}
                    <strong className={editCurrent.totalQuota - editValueNumber < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                      Sisa {editCurrent.totalQuota - editValueNumber} hari
                    </strong>
                  </>
                )}
                {editMode === 'REMAINING' && (
                  <>
                    Jatah <strong>{editCurrent.totalQuota}</strong> − sisa <strong>{editValueNumber}</strong> ={' '}
                    <strong className={editCurrent.totalQuota - editValueNumber < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                      Terpakai {editCurrent.totalQuota - editValueNumber} hari
                    </strong>
                  </>
                )}
              </p>
            )}

            {editValueInput.trim() === '' && (
              <p className="text-[11px] text-slate-400 mt-1.5">Isi angka hari terlebih dahulu.</p>
            )}

            {editQuota?.leaveType.name === 'Cuti Tahunan' && (
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                💡 Nilai jatah di sini menjadi dasar karyawan ini saat Auto Reset Tahunan dijalankan di masa mendatang.
              </p>
            )}
          </div>

          {/* Error dari server / validasi */}
          {editError && (
            <div
              role="alert"
              data-testid="edit-error"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span className="leading-relaxed">{editError}</span>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setEditQuota(null)}>
              Batal
            </Button>
            <Button
              type="submit"
              data-testid="edit-save"
              disabled={savingEdit || !editValueValid}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {savingEdit ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...
                </>
              ) : (
                'Simpan Kuota'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ================= Dialog Sinkronisasi Kuota (bulk) ================= */}
      <Modal
        isOpen={syncOpen}
        onClose={() => setSyncOpen(false)}
        title="🔄 Sinkronisasi Kuota"
        description="Isi kuota banyak karyawan sekaligus dari data yang Anda miliki"
        maxWidth="xl"
      >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Tahun</label>
              <select
                value={syncYear}
                onChange={(e) => {
                  const nextYear = parseInt(e.target.value, 10);
                  setSyncYear(nextYear);
                  setSyncResult(null);
                  setSyncError(null);
                  setSyncRowErrors({});
                  loadSyncIndex(nextYear);
                }}
                data-testid="sync-year"
                className="h-10 w-full px-3 text-xs rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={2026}>Tahun 2026</option>
                <option value={2027}>Tahun 2027</option>
                <option value={2028}>Tahun 2028</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Jenis cuti</label>
              <select
                value={syncLeaveTypeId}
                onChange={(e) => {
                  setSyncLeaveTypeId(e.target.value);
                  setSyncResult(null);
                  setSyncError(null);
                  setSyncRowErrors({});
                }}
                data-testid="sync-leave-type"
                className="h-10 w-full px-3 text-xs rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {leaveTypes.map((lt) => (
                  <option key={lt.id} value={lt.id}>
                    {lt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Data yang saya miliki</label>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200" role="group" aria-label="Mode sinkronisasi">
                {(['REMAINING', 'USED'] as SyncMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={syncMode === mode}
                    data-testid={`sync-mode-${mode.toLowerCase()}`}
                    onClick={() => {
                      setSyncMode(mode);
                      setSyncError(null);
                      setSyncRowErrors({});
                      setSyncResult(null);
                    }}
                    className={`px-1 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                      syncMode === mode
                        ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {SYNC_MODE_LABEL[mode]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Data massal — format <code className="bg-slate-100 px-1 rounded">email&lt;TAB&gt;nilai</code> atau{' '}
              <code className="bg-slate-100 px-1 rounded">email,nilai</code> (satu baris satu karyawan)
            </label>
            <textarea
              value={syncText}
              onChange={(e) => {
                setSyncText(e.target.value);
                setSyncError(null);
                setSyncRowErrors({});
                setSyncResult(null);
              }}
              rows={5}
              spellCheck={false}
              data-testid="sync-textarea"
              placeholder={'user1@besthcm.com\t8\nuser2@besthcm.com,5'}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Nilai dibaca sebagai {syncMode === 'REMAINING' ? 'SISA' : 'TERPAKAI'} hari untuk{' '}
              <strong>{syncLeaveTypeName}</strong> tahun {syncYear}.
            </p>
          </div>

          {/* Preview */}
          {syncPreview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-slate-800">
                  Pratinjau ({syncPreview.length} baris)
                </h4>
                <span
                  data-testid="sync-validation-summary"
                  className={`text-[11px] font-bold ${
                    syncInvalidRows.length > 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {syncInvalidRows.length > 0
                    ? `${syncInvalidRows.length} baris bermasalah`
                    : 'Semua baris valid'}
                </span>
              </div>

              <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-bold">#</th>
                      <th className="px-2 py-1.5 text-left font-bold">Email</th>
                      <th className="px-2 py-1.5 text-left font-bold">Nama</th>
                      <th className="px-2 py-1.5 text-right font-bold">Jatah</th>
                      <th className="px-2 py-1.5 text-right font-bold">
                        {syncMode === 'REMAINING' ? 'Sisa kini' : 'Terpakai kini'}
                      </th>
                      <th className="px-2 py-1.5 text-right font-bold">
                        {syncMode === 'REMAINING' ? 'Sisa baru' : 'Terpakai baru'}
                      </th>
                      <th className="px-2 py-1.5 text-left font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncPreview.map((row) => {
                      const serverError = syncRowErrors[row.line];
                      const hasError = row.errors.length > 0 || !!serverError;
                      return (
                        <tr
                          key={`${row.line}-${row.email}`}
                          data-testid={`sync-preview-row-${row.line}`}
                          data-invalid={hasError ? 'true' : 'false'}
                          className={hasError ? 'bg-rose-50/70' : 'odd:bg-white even:bg-slate-50/40'}
                        >
                          <td className="px-2 py-1.5 text-slate-400">{row.line}</td>
                          <td className="px-2 py-1.5 font-mono text-slate-800">{row.email || '—'}</td>
                          <td className="px-2 py-1.5 text-slate-700">
                            {row.user ? row.user.name : <span className="text-rose-600 font-semibold">tidak dikenal</span>}
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-700">{row.current ? row.current.totalQuota : '—'}</td>
                          <td className="px-2 py-1.5 text-right text-slate-700">
                            {row.current ? (syncMode === 'REMAINING' ? row.current.remainingQuota : row.current.usedQuota) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-right font-black text-indigo-700">
                            {row.after ? (syncMode === 'REMAINING' ? row.after.remainingQuota : row.after.usedQuota) : '—'}
                          </td>
                          <td className="px-2 py-1.5">
                            {hasError ? (
                              <span className="text-rose-600 font-semibold">
                                {[...row.errors, ...(serverError ? [serverError] : [])].join('; ')}
                              </span>
                            ) : (
                              <span className="text-emerald-600 font-semibold inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> siap
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {syncIndexLoading && (
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Memuat kuota tahun {syncYear}...
            </p>
          )}

          {syncError && (
            <div
              role="alert"
              data-testid="sync-error"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-semibold flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span className="leading-relaxed">{syncError}</span>
            </div>
          )}

          {syncResult && (
            <div
              role="status"
              data-testid="sync-result"
              className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span className="leading-relaxed">
                {syncResult.applied} baris diperbarui, {syncResult.skipped} dilewati (nilai sama).
              </span>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setSyncOpen(false)}>
              Tutup
            </Button>
            <Button
              type="button"
              onClick={handleApplySync}
              disabled={!syncCanApply}
              data-testid="sync-apply"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              {syncSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Menerapkan...
                </>
              ) : (
                'Terapkan'
              )}
            </Button>
          </div>
        </div>
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
