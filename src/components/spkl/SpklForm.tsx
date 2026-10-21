'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { computeHours, computeTotal, validatePp35, getDailyLimit } from '@/lib/spkl';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  DEFAULT_COMPANY,
  SPKL_TYPE_OPTIONS,
  apiErrorMessage,
  formatHours,
  formatHoursLabel,
  toDateInputValue,
  toTimeValue,
} from './spkl-ui';
import { findWorkerByNik, loadWorkers, rememberWorkers, type WorkerRecord } from './worker-directory';
import { SignerUsersHint } from './SignerUsersHint';
import { EmployeePicker } from './EmployeePicker';
import type {
  CurrentUser,
  SpklDetail,
  SpklItem,
  SpklSigner,
  SpklSignerRoleValue,
  SpklTypeValue,
  UserOption,
} from './types';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface RowDraft {
  key: string;
  /** User akun yang diwakili baris ini (opsional; kosong = pekerja alih daya manual). */
  userId: string;
  workerNik: string;
  workerName: string;
  workerPosition: string;
  taskDescription: string;
  workDate: string;
  company: string;
  startTime: string;
  endTime: string;
  /** true = nama/jabatan hasil auto-isi dari NIK, jadi boleh ditimpa saat NIK berubah. */
  autoFilled?: boolean;
}

let rowCounter = 0;
function nextRowKey(): string {
  rowCounter += 1;
  return `spkl-row-${rowCounter}`;
}

function createEmptyRow(company: string = DEFAULT_COMPANY): RowDraft {
  return {
    key: nextRowKey(),
    userId: '',
    workerNik: '',
    workerName: '',
    workerPosition: '',
    taskDescription: '',
    workDate: '',
    company,
    startTime: '',
    endTime: '',
  };
}

function rowFromItem(item: SpklItem): RowDraft {
  return {
    key: nextRowKey(),
    userId: item.userId ?? '',
    workerNik: item.workerNik ?? '',
    workerName: item.workerName ?? '',
    workerPosition: item.workerPosition ?? '',
    taskDescription: item.taskDescription ?? '',
    workDate: toDateInputValue(item.workDate),
    company: item.company || DEFAULT_COMPANY,
    startTime: toTimeValue(item.startTime),
    endTime: toTimeValue(item.endTime),
  };
}

function isBlankRow(row: RowDraft): boolean {
  return (
    !row.workerNik.trim() &&
    !row.workerName.trim() &&
    !row.workerPosition.trim() &&
    !row.taskDescription.trim() &&
    !row.workDate &&
    !row.startTime &&
    !row.endTime
  );
}

/**
 * Daftar karyawan untuk dropdown ADMIN.
 * Utamakan `GET /api/users/options` (ringkas, bisa dicari); bila belum tersedia
 * (404), pakai `GET /api/users` yang sudah ada.
 */
async function fetchUserOptions(): Promise<UserOption[]> {
  const direct = await fetch('/api/users/options');
  if (direct.ok) {
    const json = await direct.json();
    if (json?.success && Array.isArray(json.data)) return json.data as UserOption[];
  }

  const fallback = await fetch('/api/users');
  const json = await fallback.json();
  if (!fallback.ok || !json?.success || !Array.isArray(json.data)) return [];
  return (json.data as UserOption[]).map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    nip: user.nip ?? null,
    position: user.position ?? null,
    workUnit: user.workUnit ?? null,
  }));
}

/** Jam baris (0 bila jam belum lengkap/valid). Rumus sama dengan server. */
function rowHours(row: RowDraft): number {
  if (!TIME_PATTERN.test(row.startTime) || !TIME_PATTERN.test(row.endTime)) return 0;
  const hours = computeHours(row.startTime, row.endTime);
  return hours > 0 ? hours : 0;
}

/** Daftar masalah satu baris — dipakai untuk border merah & pesan singkat. */
function rowIssues(row: RowDraft): string[] {
  const issues: string[] = [];
  if (!row.workerNik.trim()) issues.push('NIK wajib diisi');
  if (!row.workerName.trim()) issues.push('Nama pekerja wajib diisi');
  if (!row.taskDescription.trim()) issues.push('Uraian tugas wajib diisi');
  if (!row.workDate) issues.push('Tanggal lembur wajib diisi');
  if (!TIME_PATTERN.test(row.startTime) || !TIME_PATTERN.test(row.endTime)) {
    issues.push('Jam mulai & selesai wajib diisi (HH:mm)');
  } else if (rowHours(row) <= 0) {
    issues.push('Jam selesai harus lebih besar dari jam mulai');
  }
  return issues;
}

interface SpklFormProps {
  mode: 'create' | 'edit';
  spklId?: string;
  initial?: SpklDetail;
}

export function SpklForm({ mode, spklId, initial }: SpklFormProps) {
  const [picId, setPicId] = useState<string>(initial?.picId ?? '');
  const [approverId, setApproverId] = useState<string>(initial?.approverId ?? '');
  const [type, setType] = useState<SpklTypeValue>(initial?.type ?? 'WORKDAY');
  const [workUnit, setWorkUnit] = useState<string>(initial?.workUnit ?? '');
  const [notes, setNotes] = useState<string>(initial?.notes ?? '');
  const [rows, setRows] = useState<RowDraft[]>(() =>
    initial && initial.items.length > 0 ? initial.items.map(rowFromItem) : [createEmptyRow()]
  );

  const [picSigners, setPicSigners] = useState<SpklSigner[]>([]);
  const [approverSigners, setApproverSigners] = useState<SpklSigner[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loadingSigners, setLoadingSigners] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState<'draft' | 'submit' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    id: string;
    number: string;
    message: string;
    warnings: string[];
  } | null>(null);

  const [quickAddRole, setQuickAddRole] = useState<SpklSignerRoleValue | null>(null);
  const [quickAddForm, setQuickAddForm] = useState({
    name: '',
    nip: '',
    position: '',
    department: '',
    workUnit: '',
  });
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [knownWorkers, setKnownWorkers] = useState<WorkerRecord[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);

  const isAdmin = currentUser?.role === 'ADMIN';

  // Direktori pekerja dari localStorage dibaca setelah mount (hindari mismatch SSR).
  useEffect(() => {
    const timer = setTimeout(() => setKnownWorkers(loadWorkers()), 0);
    return () => clearTimeout(timer);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Muat master penanda tangan + user yang login                        */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [picRes, approverRes, meRes] = await Promise.all([
          fetch('/api/spkl-signers?role=PIC'),
          fetch('/api/spkl-signers?role=APPROVER'),
          fetch('/api/auth/me'),
        ]);
        const [picJson, approverJson, meJson] = await Promise.all([
          picRes.json(),
          approverRes.json(),
          meRes.json(),
        ]);
        if (cancelled) return;

        const pics: SpklSigner[] = Array.isArray(picJson?.data) ? picJson.data : [];
        const approvers: SpklSigner[] = Array.isArray(approverJson?.data) ? approverJson.data : [];

        setPicSigners(pics);
        setApproverSigners(approvers);
        setCurrentUser(meJson?.data ?? null);

        const me = (meJson?.data ?? null) as CurrentUser | null;

        // ADMIN: muat daftar karyawan untuk dropdown per baris.
        if (me?.role === 'ADMIN') {
          const options = await fetchUserOptions().catch(() => [] as UserOption[]);
          if (!cancelled) setUserOptions(options);
        }

        // USER biasa: setiap baris otomatis memakai data diri sendiri (read-only).
        if (me && me.role !== 'ADMIN') {
          setRows((current) =>
            current.map((row) => ({
              ...row,
              userId: me.id,
              workerNik: row.workerNik || me.nip || '',
              workerName: row.workerName || me.name || '',
              workerPosition: row.workerPosition || me.position || '',
            }))
          );
        }

        // Mode buat: isi otomatis PIC & penyetuju default (beserta satuan kerjanya).
        if (mode === 'create') {
          const fallbackPic = pics.find((signer) => signer.isDefault) ?? pics[0];
          const fallbackApprover = approvers.find((signer) => signer.isDefault) ?? approvers[0];

          if (fallbackPic) {
            setPicId((current) => current || fallbackPic.id);
            setWorkUnit((current) => (current.trim() ? current : fallbackPic.workUnit ?? ''));
          }
          if (fallbackApprover) {
            setApproverId((current) => current || fallbackApprover.id);
          }
        }
      } catch {
        if (!cancelled) setLoadError('Gagal memuat master penanda tangan. Muat ulang halaman.');
      } finally {
        if (!cancelled) setLoadingSigners(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const selectedPic = useMemo(() => picSigners.find((signer) => signer.id === picId) ?? null, [picSigners, picId]);
  const selectedApprover = useMemo(
    () => approverSigners.find((signer) => signer.id === approverId) ?? null,
    [approverSigners, approverId]
  );

  const handlePicChange = useCallback(
    (value: string) => {
      setPicId(value);
      const signer = picSigners.find((item) => item.id === value);
      if (signer?.workUnit) setWorkUnit(signer.workUnit);
    },
    [picSigners]
  );

  /* ------------------------------------------------------------------ */
  /* Baris rincian                                                       */
  /* ------------------------------------------------------------------ */
  const updateRow = useCallback((key: string, patch: Partial<RowDraft>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, []);

  /**
   * NIK berubah → auto-isi Nama & Jabatan bila sudah dikenal (dari direktori
   * pekerja browser) dan kolomnya masih kosong / belum disentuh manual.
   */
  const handleNikChange = useCallback(
    (key: string, nik: string) => {
      setRows((current) =>
        current.map((row) => {
          if (row.key !== key) return row;

          const next: RowDraft = { ...row, workerNik: nik };
          const match = findWorkerByNik(nik, knownWorkers);
          if (!match) return next;

          const nameUntouched = !row.workerName.trim() || row.autoFilled;
          const positionUntouched = !row.workerPosition.trim() || row.autoFilled;

          if (nameUntouched && match.name) next.workerName = match.name;
          if (positionUntouched && match.position) next.workerPosition = match.position;
          next.autoFilled = true;
          return next;
        })
      );
    },
    [knownWorkers]
  );

  /**
   * ADMIN memilih karyawan dari dropdown → auto-isi NIK / Nama / Jabatan.
   * Memilih opsi kosong berarti "pekerja alih daya manual" (bukan user sistem).
   */
  const handleEmployeeChange = useCallback(
    (key: string, optionId: string) => {
      const option = userOptions.find((item) => item.id === optionId);
      setRows((current) =>
        current.map((row) => {
          if (row.key !== key) return row;
          if (!option) return { ...row, userId: '', autoFilled: false };

          const nip = option.nip && option.nip !== '-' ? option.nip : '';
          const position = option.position && option.position !== '-' ? option.position : '';
          return {
            ...row,
            userId: option.id,
            workerNik: nip || row.workerNik,
            workerName: option.name || row.workerName,
            workerPosition: position || row.workerPosition,
            autoFilled: true,
          };
        })
      );
    },
    [userOptions]
  );

  const addRow = useCallback(() => {
    setRows((current) => {
      const lastCompany = [...current].reverse().find((row) => row.company.trim())?.company;
      const next = createEmptyRow(lastCompany || DEFAULT_COMPANY);
      // USER biasa: baris baru langsung memakai data diri sendiri.
      if (currentUser && currentUser.role !== 'ADMIN') {
        next.userId = currentUser.id;
        next.workerNik = currentUser.nip && currentUser.nip !== '-' ? currentUser.nip : '';
        next.workerName = currentUser.name;
        next.workerPosition = currentUser.position && currentUser.position !== '-' ? currentUser.position : '';
      }
      return [...current, next];
    });
  }, [currentUser]);

  const duplicateRow = useCallback((key: string) => {
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key);
      if (index < 0) return current;
      const source = current[index];
      // Semua kolom disalin kecuali tanggal (supaya input cepat per tanggal).
      const copy: RowDraft = { ...source, key: nextRowKey(), workDate: '' };
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }, []);

  const removeRow = useCallback((key: string) => {
    setRows((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== key)));
  }, []);

  const companyOptions = useMemo(() => {
    const values = new Set<string>([DEFAULT_COMPANY]);
    rows.forEach((row) => {
      const value = row.company.trim();
      if (value) values.add(value);
    });
    return Array.from(values);
  }, [rows]);

  const effectiveRows = useMemo(() => rows.filter((row) => !isBlankRow(row)), [rows]);

  const validRows = useMemo(
    () => effectiveRows.filter((row) => rowIssues(row).length === 0),
    [effectiveRows]
  );

  const totalHours = useMemo(
    () => computeTotal(validRows.map((row) => ({ hours: rowHours(row) }))),
    [validRows]
  );

  const workerCount = useMemo(
    () => new Set(effectiveRows.map((row) => row.workerNik.trim()).filter(Boolean)).size,
    [effectiveRows]
  );

  // Batas harian hanya berlaku untuk jenis lembur yang punya batas
  // (saat ini hanya Lembur Hari Kerja; jenis lain `null` = tanpa batas).
  const dailyLimit = getDailyLimit(type);

  const dailyViolations = useMemo(
    () =>
      effectiveRows.filter((row) => {
        const limit = getDailyLimit(type);
        return limit !== null && rowHours(row) > limit;
      }),
    [effectiveRows, type]
  );

  /** Peringatan PP 35/2021 (mingguan/bulanan) dari baris yang sedang diisi. */
  const liveWarnings = useMemo(() => {
    const items = effectiveRows
      .map((row) => ({
        workerNik: row.workerNik.trim(),
        workerName: row.workerName.trim() || 'Pekerja',
        workDate: row.workDate,
        hours: rowHours(row),
        type,
      }))
      .filter((item) => item.workerNik && item.workDate && item.hours > 0);

    if (items.length === 0) return [];
    return validatePp35(items, [], {}).warnings;
  }, [effectiveRows, type]);

  /* ------------------------------------------------------------------ */
  /* Tambah penanda tangan cepat                                         */
  /* ------------------------------------------------------------------ */
  const openQuickAdd = (role: SpklSignerRoleValue) => {
    setQuickAddRole(role);
    setQuickAddError(null);
    setQuickAddForm({ name: '', nip: '', position: '', department: '', workUnit: '' });
  };

  const saveQuickAdd = async () => {
    if (!quickAddRole) return;
    if (quickAddForm.name.trim().length < 2) {
      setQuickAddError('Nama penanda tangan minimal 2 karakter');
      return;
    }

    setQuickAddSaving(true);
    setQuickAddError(null);

    try {
      const response = await fetch('/api/spkl-signers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: quickAddRole,
          name: quickAddForm.name.trim(),
          nip: quickAddForm.nip.trim() || null,
          position: quickAddForm.position.trim() || null,
          department: quickAddForm.department.trim() || null,
          workUnit: quickAddForm.workUnit.trim() || null,
          isActive: true,
          isDefault: false,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(apiErrorMessage(json, 'Gagal menambahkan penanda tangan'));
      }

      const created = json.data as SpklSigner;
      if (quickAddRole === 'PIC') {
        setPicSigners((current) => [...current, created]);
        setPicId(created.id);
        if (created.workUnit) setWorkUnit(created.workUnit);
      } else {
        setApproverSigners((current) => [...current, created]);
        setApproverId(created.id);
      }
      setQuickAddRole(null);
    } catch (error) {
      setQuickAddError(error instanceof Error ? error.message : 'Gagal menambahkan penanda tangan');
    } finally {
      setQuickAddSaving(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Simpan                                                              */
  /* ------------------------------------------------------------------ */
  const handleSubmit = async (asDraft: boolean) => {
    setAttempted(true);
    setFormError(null);
    setResult(null);

    if (!picId) {
      setFormError('Yang Menugaskan (PIC) wajib dipilih.');
      return;
    }
    if (!approverId) {
      setFormError('Yang Menyetujui wajib dipilih.');
      return;
    }
    if (effectiveRows.length === 0) {
      setFormError('Minimal 1 baris pekerja. Klik "+ Tambah Baris" untuk mulai mengisi.');
      return;
    }
    const invalidRows = effectiveRows.filter((row) => rowIssues(row).length > 0);
    if (invalidRows.length > 0) {
      setFormError(
        `${invalidRows.length} baris belum lengkap atau jamnya tidak valid. Periksa baris yang ditandai merah.`
      );
      return;
    }

    setSubmitting(asDraft ? 'draft' : 'submit');

    const payload = {
      picId,
      approverId,
      type,
      workUnit: workUnit.trim() || null,
      notes: notes.trim() || null,
      submit: !asDraft,
      items: effectiveRows.map((row) => ({
        // `userId` opsional: hanya untuk baris yang mewakili akun karyawan.
        // Bila pemanggil bukan ADMIN, server memaksa memakai id pemanggil.
        ...(row.userId ? { userId: row.userId } : {}),
        workerNik: row.workerNik.trim(),
        workerName: row.workerName.trim(),
        workerPosition: row.workerPosition.trim() || null,
        company: row.company.trim() || DEFAULT_COMPANY,
        taskDescription: row.taskDescription.trim(),
        workDate: row.workDate,
        startTime: row.startTime,
        endTime: row.endTime,
      })),
    };

    try {
      const response = await fetch(mode === 'edit' ? `/api/spkl/${spklId}` : '/api/spkl', {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(apiErrorMessage(json, 'Gagal menyimpan SPKL'));
      }

      setResult({
        id: json.data?.id ?? spklId ?? '',
        number: json.data?.number ?? '',
        message: json.message ?? 'SPKL berhasil disimpan',
        warnings: Array.isArray(json.warnings) ? json.warnings : [],
      });

      // Ingat NIK → Nama/Jabatan supaya input berikutnya terisi otomatis.
      rememberWorkers(
        effectiveRows.map((row) => ({
          nik: row.workerNik,
          name: row.workerName,
          position: row.workerPosition,
        }))
      );
      setKnownWorkers(loadWorkers());
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Gagal menyimpan SPKL');
    } finally {
      setSubmitting(null);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
  const inputClass =
    'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
  const errorInputClass =
    'w-full rounded-md border border-rose-400 bg-rose-50/40 px-2 py-1.5 text-xs text-slate-900 placeholder:text-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent';

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link href="/spkl">
            <Button variant="outline" size="sm" className="rounded-lg">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {mode === 'edit' ? 'Edit SPKL' : 'Buat SPKL Baru'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === 'edit'
                ? `Perbarui rincian ${initial?.number ?? 'SPKL'} — jam dihitung otomatis oleh sistem.`
                : 'Isi identitas penanda tangan, pilih jenis lembur, lalu tambahkan baris pekerja.'}
            </p>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="p-4 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs font-medium">
          {loadError}
        </div>
      )}

      {result && (
        <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-900 space-y-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-xs font-semibold">
              {result.message}
              {result.number ? ` — ${result.number}` : ''}
            </div>
          </div>
          {result.warnings.length > 0 && (
            <ul className="ml-6 list-disc space-y-1 text-[11px] font-medium text-amber-800">
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {result.id && (
            <Link href={`/spkl/${result.id}`} className="ml-6 inline-block">
              <Button size="sm" variant="success">
                Buka Detail SPKL
              </Button>
            </Link>
          )}
        </div>
      )}

      {formError && (
        <div className="p-4 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      {/* A. Identitas */}
      <Card className="p-5 md:p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">Identitas &amp; Jenis Lembur</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label htmlFor="spkl-pic" className="block text-xs font-semibold text-slate-700">
              Yang Menugaskan (PIC) <span className="text-rose-600">*</span>
            </label>
            <select
              id="spkl-pic"
              value={picId}
              onChange={(event) => handlePicChange(event.target.value)}
              disabled={loadingSigners}
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50"
            >
              <option value="">{loadingSigners ? 'Memuat...' : '— Pilih PIC —'}</option>
              {picSigners.map((signer) => (
                <option key={signer.id} value={signer.id}>
                  {signer.name}
                  {signer.position ? ` — ${signer.position}` : ''}
                  {signer.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-0.5">
              <p>
                <span className="font-semibold text-slate-500">Jabatan:</span>{' '}
                {selectedPic?.position || '—'}
              </p>
              <p>
                <span className="font-semibold text-slate-500">NIP:</span> {selectedPic?.nip || '—'}
              </p>
              <p>
                <span className="font-semibold text-slate-500">Satuan Kerja:</span>{' '}
                {selectedPic?.workUnit || '—'}
              </p>
              <SignerUsersHint users={selectedPic?.users} label="Terhubung ke" />
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => openQuickAdd('PIC')}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
              >
                <UserPlus className="w-3.5 h-3.5" /> + Tambah PIC baru
              </button>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="spkl-approver" className="block text-xs font-semibold text-slate-700">
              Yang Menyetujui <span className="text-rose-600">*</span>
            </label>
            <select
              id="spkl-approver"
              value={approverId}
              onChange={(event) => setApproverId(event.target.value)}
              disabled={loadingSigners}
              className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-slate-50"
            >
              <option value="">{loadingSigners ? 'Memuat...' : '— Pilih Penyetuju —'}</option>
              {approverSigners.map((signer) => (
                <option key={signer.id} value={signer.id}>
                  {signer.name}
                  {signer.department ? ` — ${signer.department}` : ''}
                  {signer.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 space-y-0.5">
              <p>
                <span className="font-semibold text-slate-500">Departemen:</span>{' '}
                {selectedApprover?.department || '—'}
              </p>
              <p>
                <span className="font-semibold text-slate-500">Jabatan:</span>{' '}
                {selectedApprover?.position || '—'}
              </p>
              <p>
                <span className="font-semibold text-slate-500">NIP:</span> {selectedApprover?.nip || '—'}
              </p>
              <SignerUsersHint users={selectedApprover?.users} label="Terhubung ke" />
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => openQuickAdd('APPROVER')}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-700 hover:text-indigo-900"
              >
                <UserPlus className="w-3.5 h-3.5" /> + Tambah Penyetuju baru
              </button>
            )}
          </div>
        </div>

        <fieldset>
          <legend className="block text-xs font-semibold text-slate-700 mb-2">
            Jenis Lembur <span className="text-rose-600">*</span>
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SPKL_TYPE_OPTIONS.map((option) => {
              const active = type === option.value;
              return (
                <label
                  key={option.value}
                  className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                    active
                      ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-200'
                      : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="spkl-type"
                    value={option.value}
                    checked={active}
                    onChange={() => setType(option.value)}
                    className="sr-only"
                  />
                  <span className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        active ? 'border-indigo-600' : 'border-slate-300'
                      }`}
                    >
                      {active && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                    </span>
                    <span>
                      <span
                        className={`block text-xs font-bold ${
                          active ? 'text-indigo-900' : 'text-slate-800'
                        }`}
                      >
                        {option.label}
                      </span>
                      <span className="block text-[10px] text-slate-500 mt-0.5 leading-snug">
                        {option.description}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              label="Satuan Kerja"
              value={workUnit}
              onChange={(event) => setWorkUnit(event.target.value)}
              placeholder="Contoh: FMWR"
              maxLength={50}
              className="h-10"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Terisi otomatis dari PIC, bisa diubah. Dipakai pada nomor SPKL.
            </p>
          </div>
          <div>
            <label htmlFor="spkl-notes" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Catatan Internal (opsional)
            </label>
            <textarea
              id="spkl-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="Catatan tambahan untuk penyetuju..."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>
      </Card>

      {/* B. Rincian pekerja */}
      <Card className="p-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Rincian Pekerja</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Jam dihitung otomatis dari kolom Mulai–Selesai (mendukung lewat tengah malam).
            </p>
          </div>
          <Button type="button" onClick={addRow} size="sm" className="self-start sm:self-auto">
            <Plus className="w-4 h-4" /> + Tambah Baris
          </Button>
        </div>

        {!isAdmin && currentUser && (!currentUser.nip || currentUser.nip === '-' || !currentUser.position || currentUser.position === '-') && (
          <div className="mx-5 mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Sebagian data profil Anda belum lengkap (NIK dan/atau Jabatan). Baris di bawah otomatis memakai
              data diri Anda; lengkapi profil agar NIK &amp; jabatan ikut tercetak pada SPKL.
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-xs">
            <thead className="bg-slate-100/80 text-[10px] uppercase tracking-wider text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-2 py-2.5 w-8 text-center">#</th>
                {isAdmin && <th className="px-2 py-2.5 w-[190px]">Karyawan</th>}
                <th className="px-2 py-2.5 w-[104px]">NIK</th>
                <th className="px-2 py-2.5 w-[150px]">Nama</th>
                <th className="px-2 py-2.5 w-[140px]">Jabatan/Posisi</th>
                <th className="px-2 py-2.5 min-w-[200px]">Uraian Tugas</th>
                <th className="px-2 py-2.5 w-[132px]">Tanggal Lembur</th>
                <th className="px-2 py-2.5 w-[168px]">Perusahaan Alih Daya</th>
                <th className="px-2 py-2.5 w-[92px]">Mulai</th>
                <th className="px-2 py-2.5 w-[92px]">Selesai</th>
                <th className="px-2 py-2.5 w-[64px] text-center">Jam</th>
                <th className="px-2 py-2.5 w-[76px] text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row, index) => {
                const issues = rowIssues(row);
                const showError = attempted && issues.length > 0;
                const hours = rowHours(row);
                const tooLong = dailyLimit !== null && hours > dailyLimit;
                return (
                  <tr key={row.key} className={showError ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'}>
                    <td className="px-2 py-2 text-center text-[11px] font-bold text-slate-400">
                      {index + 1}
                    </td>
                    {isAdmin && (
                      <td className="px-2 py-2 align-top">
                        <EmployeePicker
                          users={userOptions}
                          value={row.userId}
                          onChange={(userId) => handleEmployeeChange(row.key, userId)}
                          label={`Karyawan baris ${index + 1}`}
                        />
                      </td>
                    )}
                    <td className="px-2 py-2 align-top">
                      {isAdmin ? (
                        <input
                          list={knownWorkers.length > 0 ? 'spkl-worker-options' : undefined}
                          aria-label={`NIK baris ${index + 1}`}
                          value={row.workerNik}
                          onChange={(event) => handleNikChange(row.key, event.target.value)}
                          onBlur={() => {
                            // Isi otomatis juga saat NIK ditempel lalu blur.
                            const match = findWorkerByNik(row.workerNik, knownWorkers);
                            if (!match) return;
                            if (!row.workerName.trim() && match.name) {
                              updateRow(row.key, { workerName: match.name });
                            }
                            if (!row.workerPosition.trim() && match.position) {
                              updateRow(row.key, { workerPosition: match.position });
                            }
                          }}
                          placeholder="PA25951042"
                          className={showError && !row.workerNik.trim() ? errorInputClass : inputClass}
                        />
                      ) : (
                        <p
                          aria-label={`NIK baris ${index + 1}`}
                          className="px-1.5 py-1.5 text-xs font-mono text-slate-700 break-all"
                        >
                          {row.workerNik || '-'}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      {isAdmin ? (
                        <input
                          aria-label={`Nama pekerja baris ${index + 1}`}
                          value={row.workerName}
                          onChange={(event) =>
                            updateRow(row.key, { workerName: event.target.value, autoFilled: false })
                          }
                          placeholder="Nama pekerja"
                          className={showError && !row.workerName.trim() ? errorInputClass : inputClass}
                        />
                      ) : (
                        <p
                          aria-label={`Nama pekerja baris ${index + 1}`}
                          className="px-1.5 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          {row.workerName || '-'}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      {isAdmin ? (
                        <input
                          aria-label={`Jabatan baris ${index + 1}`}
                          value={row.workerPosition}
                          onChange={(event) =>
                            updateRow(row.key, { workerPosition: event.target.value, autoFilled: false })
                          }
                          placeholder="Operator ..."
                          className={inputClass}
                        />
                      ) : (
                        <p
                          aria-label={`Jabatan baris ${index + 1}`}
                          className="px-1.5 py-1.5 text-xs text-slate-700"
                        >
                          {row.workerPosition || '-'}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <textarea
                        aria-label={`Uraian tugas baris ${index + 1}`}
                        value={row.taskDescription}
                        onChange={(event) => {
                          const el = event.currentTarget;
                          updateRow(row.key, { taskDescription: el.value });
                          // Auto-grow: tinggi mengikuti isi (min 2 baris).
                          el.style.height = 'auto';
                          el.style.height = `${Math.max(46, el.scrollHeight)}px`;
                        }}
                        rows={2}
                        placeholder="Tulis uraian tugas… (boleh lebih dari satu baris)"
                        onKeyDown={(event) => {
                          // Enter di textarea hanya menambah baris — jangan pernah
                          // memicu submit implisit pada form.
                          if (event.key === 'Enter') event.stopPropagation();
                        }}
                        className={`${showError && !row.taskDescription.trim() ? errorInputClass : inputClass} min-h-[46px] resize-y leading-snug whitespace-pre-wrap`}
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        type="date"
                        aria-label={`Tanggal lembur baris ${index + 1}`}
                        value={row.workDate}
                        onChange={(event) => updateRow(row.key, { workDate: event.target.value })}
                        className={showError && !row.workDate ? errorInputClass : inputClass}
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        list="spkl-company-options"
                        aria-label={`Perusahaan baris ${index + 1}`}
                        value={row.company}
                        onChange={(event) => updateRow(row.key, { company: event.target.value })}
                        placeholder={DEFAULT_COMPANY}
                        className={inputClass}
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        type="time"
                        aria-label={`Jam mulai baris ${index + 1}`}
                        value={row.startTime}
                        onChange={(event) => updateRow(row.key, { startTime: event.target.value })}
                        className={
                          showError && !TIME_PATTERN.test(row.startTime) ? errorInputClass : inputClass
                        }
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        type="time"
                        aria-label={`Jam selesai baris ${index + 1}`}
                        value={row.endTime}
                        onChange={(event) => updateRow(row.key, { endTime: event.target.value })}
                        className={
                          showError && !TIME_PATTERN.test(row.endTime) ? errorInputClass : inputClass
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-center align-top">
                      <span
                        className={`inline-block min-w-[42px] rounded-md px-1.5 py-1 text-xs font-bold ${
                          tooLong
                            ? 'bg-rose-100 text-rose-700'
                            : hours > 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                        title={
                          tooLong
                            ? `Melebihi batas ${dailyLimit} jam/hari (PP 35/2021)`
                            : 'Dihitung otomatis oleh sistem'
                        }
                      >
                        {hours > 0 ? formatHours(hours) : '—'}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => duplicateRow(row.key)}
                          title="Duplikat baris (tanpa tanggal)"
                          aria-label={`Duplikat baris ${index + 1}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRow(row.key)}
                          disabled={rows.length <= 1}
                          title="Hapus baris"
                          aria-label={`Hapus baris ${index + 1}`}
                          className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <datalist id="spkl-company-options">
          {companyOptions.map((company) => (
            <option key={company} value={company} />
          ))}
        </datalist>

        <datalist id="spkl-worker-options">
          {knownWorkers.map((worker) => (
            <option key={worker.nik} value={worker.nik}>
              {worker.name}
              {worker.position ? ` — ${worker.position}` : ''}
            </option>
          ))}
        </datalist>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 rounded-lg border-2 border-dashed border-indigo-300 text-xs font-bold text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 transition-colors"
          >
            <Plus className="w-4 h-4" /> + Tambah Baris
          </button>
          <p className="text-[11px] text-slate-500">
            {attempted && effectiveRows.some((row) => rowIssues(row).length > 0)
              ? 'Masih ada baris yang belum valid (ditandai merah).'
              : 'Gunakan tombol duplikat untuk menyalin baris dengan cepat.'}
          </p>
        </div>
      </Card>

      {/* Peringatan PP 35/2021 */}
      {(dailyViolations.length > 0 || liveWarnings.length > 0) && (
        <div className="space-y-2">
          {dailyViolations.length > 0 && (
            <div className="p-4 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4" /> Melebihi batas {dailyLimit} jam/hari (PP 35/2021)
              </div>
              <ul className="ml-6 list-disc space-y-0.5 font-medium">
                {dailyViolations.map((row) => (
                  <li key={row.key}>
                    {row.workerName || row.workerNik || 'Baris'} — {formatHoursLabel(rowHours(row))} (maksimal{' '}
                    {dailyLimit} jam per hari). Sistem akan menolak SPKL ini.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {liveWarnings.length > 0 && (
            <div className="p-4 rounded-xl border bg-amber-50 border-amber-200 text-amber-900 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="w-4 h-4" /> Peringatan akumulasi lembur (PP 35/2021)
              </div>
              <ul className="ml-6 list-disc space-y-0.5 font-medium">
                {liveWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p className="ml-6 text-[11px] italic">
                Peringatan tidak menghalangi penyimpanan — tetap boleh dilanjutkan.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Ringkasan sticky + aksi */}
      <div className="sticky bottom-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-white/95 backdrop-blur border-t border-slate-200 shadow-[0_-4px_16px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total Jam</p>
              <p className="text-lg font-extrabold text-indigo-700 leading-tight">
                {formatHours(totalHours)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Jumlah Pekerja
              </p>
              <p className="text-lg font-extrabold text-slate-900 leading-tight">{workerCount}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Jumlah Baris
              </p>
              <p className="text-lg font-extrabold text-slate-900 leading-tight">{effectiveRows.length}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSubmit(true)}
              disabled={submitting !== null}
              className="font-bold"
            >
              {submitting === 'draft' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Simpan Draf
            </Button>
            <Button
              type="button"
              onClick={() => handleSubmit(false)}
              disabled={submitting !== null}
              className="font-bold"
            >
              {submitting === 'submit' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Ajukan
            </Button>
          </div>
        </div>
      </div>

      {/* Modal tambah penanda tangan cepat */}
      <Modal
        isOpen={quickAddRole !== null}
        onClose={() => setQuickAddRole(null)}
        title={quickAddRole === 'PIC' ? 'Tambah PIC (Yang Menugaskan)' : 'Tambah Penyetuju'}
        description="Data langsung tersimpan di master penanda tangan dan otomatis terpilih."
        maxWidth="lg"
      >
        <div className="space-y-3">
          {quickAddError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {quickAddError}
            </div>
          )}
          {!isAdmin && currentUser && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium">
              Hanya admin yang dapat menambah master penanda tangan. Hubungi admin untuk menambah data baru.
            </div>
          )}
          <Input
            label="Nama *"
            value={quickAddForm.name}
            onChange={(event) => setQuickAddForm((form) => ({ ...form, name: event.target.value }))}
            placeholder="Nama lengkap penanda tangan"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="NIP"
              value={quickAddForm.nip}
              onChange={(event) => setQuickAddForm((form) => ({ ...form, nip: event.target.value }))}
              placeholder="7796130645"
            />
            <Input
              label="Satuan Kerja"
              value={quickAddForm.workUnit}
              onChange={(event) => setQuickAddForm((form) => ({ ...form, workUnit: event.target.value }))}
              placeholder="FMWR"
            />
          </div>
          <Input
            label="Jabatan"
            value={quickAddForm.position}
            onChange={(event) => setQuickAddForm((form) => ({ ...form, position: event.target.value }))}
            placeholder="VEGETATION MANAGEMENT SEC. HEAD"
          />
          <Input
            label="Departemen"
            value={quickAddForm.department}
            onChange={(event) => setQuickAddForm((form) => ({ ...form, department: event.target.value }))}
            placeholder="FORESTRY MGMT & WATERSHED REH DEPT. HEAD"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setQuickAddRole(null)}>
              Batal
            </Button>
            <Button type="button" onClick={saveQuickAdd} disabled={quickAddSaving || !isAdmin}>
              {quickAddSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Simpan &amp; Pilih
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
