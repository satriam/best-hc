'use client';

import React, { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { SpklStatusBadge } from '@/components/spkl/SpklStatusBadge';
import { SignerUsersHint } from '@/components/spkl/SignerUsersHint';
import { SpklPrintStyles, SpklPrintTemplate } from '@/components/spkl/SpklPrintTemplate';
import {
  SPKL_TYPE_LABEL,
  formatDateID,
  formatHours,
  toTimeValue,
} from '@/components/spkl/spkl-ui';
import type { CurrentUser, SpklDetail, SpklStatusValue } from '@/components/spkl/types';
import { formatDateTime } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit,
  Info,
  Loader2,
  Printer,
  Send,
  ShieldCheck,
  User,
  Users,
  XCircle,
} from 'lucide-react';

/** Batasan hukum PP 35/2021 — isi sama dengan form cetak. */
const PP35_ROWS: Array<{ ketentuan: string; nilai: string }> = [
  { ketentuan: 'Maksimal lembur harian', nilai: '4 jam per hari' },
  { ketentuan: 'Maksimal lembur mingguan', nilai: '18 jam per minggu (di luar lembur hari libur resmi)' },
  { ketentuan: 'Maksimal lembur bulanan', nilai: '72 jam per bulan (di luar lembur hari libur resmi)' },
  { ketentuan: 'Lembur hari kerja biasa', nilai: 'Jam pertama x 1,5; jam berikutnya x 2' },
  {
    ketentuan: 'Lembur hari istirahat mingguan / libur resmi (shift 6 hari kerja)',
    nilai: 'Jam ke-1 s.d ke-8 x 2; jam ke-9 x 3; jam ke-10 dst x 4',
  },
];

export default function SpklDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [spkl, setSpkl] = useState<SpklDetail | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<SpklStatusValue | 'print' | null>(null);
  const [showPp35, setShowPp35] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const printedRef = useRef(false);

  const loadDetail = useCallback(async () => {
    const response = await fetch(`/api/spkl/${id}`);
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.message || 'Gagal memuat SPKL');
    }
    return json.data as SpklDetail;
  }, [id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [detail, meResponse] = await Promise.all([loadDetail(), fetch('/api/auth/me')]);
        const meJson = await meResponse.json();
        if (cancelled) return;
        setSpkl(detail);
        setCurrentUser(meJson?.data ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat SPKL');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadDetail]);

  // Cetak otomatis ketika halaman dibuka dengan ?print=1 (dari tombol cetak di daftar).
  useEffect(() => {
    if (!spkl || printedRef.current) return;
    if (typeof window === 'undefined') return;
    const shouldPrint = new URLSearchParams(window.location.search).get('print') === '1';
    if (!shouldPrint) return;
    printedRef.current = true;
    const timer = setTimeout(() => window.print(), 400);
    return () => clearTimeout(timer);
  }, [spkl]);

  const changeStatus = async (status: SpklStatusValue, rejectedNote?: string) => {
    if (!spkl) return;
    setBusy(status);
    setActionMsg(null);
    try {
      const response = await fetch(`/api/spkl/${spkl.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...(rejectedNote ? { rejectedNote } : {}) }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengubah status SPKL');
      }
      setSpkl(json.data as SpklDetail);
      setActionMsg({ type: 'success', text: json.message || 'Status SPKL berhasil diubah.' });
      setRejectOpen(false);
      setRejectReason('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal mengubah status SPKL';
      if (rejectedNote) setRejectError(message);
      else setActionMsg({ type: 'error', text: message });
    } finally {
      setBusy(null);
    }
  };

  const handlePrint = () => {
    setBusy('print');
    window.print();
    setTimeout(() => setBusy(null), 600);
  };

  if (loading) {
    return (
      <Card className="p-10 text-center text-sm text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat SPKL...
        </span>
      </Card>
    );
  }

  if (error || !spkl) {
    return (
      <Card className="p-8 space-y-3">
        <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
          <AlertTriangle className="w-4 h-4" /> {error || 'SPKL tidak ditemukan'}
        </div>
        <Link href="/spkl">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4" /> Kembali ke daftar SPKL
          </Button>
        </Link>
      </Card>
    );
  }

  const isAdmin = currentUser?.role === 'ADMIN';
  const isOwner = currentUser?.id === spkl.requesterId;
  const editable = spkl.status === 'DRAFT' || spkl.status === 'ON_PROGRESS';
  const canEdit = editable && (isOwner || isAdmin);
  const canSubmit = spkl.status === 'DRAFT' && (isOwner || isAdmin);
  // Sesuai kebijakan: HANYA ADMIN yang boleh menyetujui/menolak SPKL.
  const canDecide = spkl.status === 'ON_PROGRESS' && isAdmin;
  const canCancel =
    (spkl.status === 'DRAFT' || spkl.status === 'ON_PROGRESS' || spkl.status === 'REJECTED') &&
    (isOwner || isAdmin);
  const workerCount = new Set(spkl.items.map((item) => item.workerNik)).size;

  return (
    <React.Fragment>
      <SpklPrintStyles />

      {/* ===================== TAMPILAN LAYAR ===================== */}
      <div className="w-full space-y-6 print:hidden">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Link href="/spkl">
              <Button variant="outline" size="sm" className="rounded-lg">
                <ArrowLeft className="w-4 h-4" /> Kembali
              </Button>
            </Link>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{spkl.number}</h1>
                <SpklStatusBadge status={spkl.status} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Surat Perintah Kerja Lembur · {SPKL_TYPE_LABEL[spkl.type]} · dibuat{' '}
                {formatDateTime(spkl.createdAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <Link href={`/spkl/${spkl.id}/edit`}>
                <Button variant="outline" size="sm" className="font-bold border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
                  <Edit className="w-4 h-4" /> Edit
                </Button>
              </Link>
            )}
            {canSubmit && (
              <Button
                size="sm"
                onClick={() => changeStatus('ON_PROGRESS')}
                disabled={busy !== null}
                className="font-bold"
              >
                {busy === 'ON_PROGRESS' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Ajukan
              </Button>
            )}
            {canDecide && (
              <>
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => changeStatus('APPROVED')}
                  disabled={busy !== null}
                  className="font-bold"
                >
                  {busy === 'APPROVED' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Setujui
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setRejectReason('');
                    setRejectError(null);
                    setRejectOpen(true);
                  }}
                  disabled={busy !== null}
                  className="font-bold"
                >
                  <XCircle className="w-4 h-4" /> Tolak
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={handlePrint} className="font-bold">
              <Printer className="w-4 h-4" /> Cetak
            </Button>
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm(`Batalkan SPKL ${spkl.number}?`)) changeStatus('CANCELLED');
                }}
                disabled={busy !== null}
                className="border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100"
              >
                {busy === 'CANCELLED' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Ban className="w-4 h-4" />
                )}
                Batalkan
              </Button>
            )}
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

        {spkl.status === 'REJECTED' && spkl.rejectedNote && (
          <div className="p-4 rounded-xl border bg-rose-50 border-rose-200 text-rose-900 text-xs space-y-1">
            <div className="flex items-center gap-2 font-bold">
              <XCircle className="w-4 h-4" /> SPKL ditolak
            </div>
            <p className="font-medium">{spkl.rejectedNote}</p>
          </div>
        )}

        {spkl.status === 'APPROVED' && spkl.approvedAt && (
          <div className="p-4 rounded-xl border bg-emerald-50 border-emerald-200 text-emerald-900 text-xs flex items-center gap-2 font-medium">
            <ShieldCheck className="w-4 h-4" /> Disetujui pada {formatDateTime(spkl.approvedAt)}
          </div>
        )}

        {/* Ringkasan */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Jenis Lembur
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">{SPKL_TYPE_LABEL[spkl.type]}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Satuan kerja: {spkl.workUnit || '—'}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Jam / Pekerja
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {formatHours(spkl.totalHours)} Jam · {workerCount} pekerja
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">{spkl.items.length} baris rincian</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              PIC (Yang Menugaskan)
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">{spkl.pic.name}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {spkl.pic.position || '—'} · NIP {spkl.pic.nip || '-'}
            </p>
            <SignerUsersHint users={spkl.pic.users} label="User terhubung" variant="chips" />
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Penyetuju
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">{spkl.approver.name}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              {spkl.approver.department || spkl.approver.position || '—'} · NIP{' '}
              {spkl.approver.nip || '-'}
            </p>
            <SignerUsersHint users={spkl.approver.users} label="User terhubung" variant="chips" />
          </Card>
        </div>

        {/* Rincian */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">Rincian Pekerja</h2>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              {spkl.items.length} baris · {formatHours(spkl.totalHours)} jam
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-xs text-slate-600">
              <thead className="bg-slate-100/70 text-slate-700 font-semibold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">No</th>
                  <th className="px-4 py-3">NIK</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Jabatan/Posisi</th>
                  <th className="px-4 py-3">Uraian Tugas</th>
                  <th className="px-4 py-3">Tanggal Lembur</th>
                  <th className="px-4 py-3">Perusahaan Alih Daya</th>
                  <th className="px-4 py-3 text-center">Mulai</th>
                  <th className="px-4 py-3 text-center">Selesai</th>
                  <th className="px-4 py-3 text-right">Jam</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {spkl.items.map((item, index) => (
                  <tr
                    key={item.id ?? `${item.workerNik}-${index}`}
                    className="odd:bg-white even:bg-slate-50/70 hover:bg-indigo-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-slate-400 font-bold">{index + 1}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                      {item.workerNik}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.workerName}</td>
                    <td className="px-4 py-3">{item.workerPosition || '—'}</td>
                    <td className="px-4 py-3 max-w-[320px] whitespace-pre-wrap break-words">
                      {item.taskDescription}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDateID(item.workDate)}</td>
                    <td className="px-4 py-3">{item.company || '—'}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">{toTimeValue(item.startTime)}</td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">{toTimeValue(item.endTime)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                      {formatHours(item.hours)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-indigo-50/60">
                  <td colSpan={9} className="px-4 py-3 text-right text-xs font-extrabold uppercase tracking-wide text-indigo-900">
                    Total Jam Kerja Lembur
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-extrabold text-indigo-900 whitespace-nowrap">
                    {formatHours(spkl.totalHours)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Panel PP 35/2021 */}
        <Card className="p-0 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPp35((open) => !open)}
            aria-expanded={showPp35}
            className="w-full flex items-center justify-between gap-2 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-bold text-slate-900">
                Batasan Hukum yang Perlu Diketahui (PP 35/2021)
              </span>
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-500 transition-transform ${showPp35 ? 'rotate-180' : ''}`}
            />
          </button>

          {showPp35 && (
            <div className="px-5 pb-5 space-y-3">
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="bg-[#002060] text-white">
                    <tr>
                      <th className="px-3 py-2 font-bold">Ketentuan</th>
                      <th className="px-3 py-2 font-bold">Nilai / Formula</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {PP35_ROWS.map((row) => (
                      <tr key={row.ketentuan}>
                        <td className="px-3 py-2 font-semibold text-slate-800">{row.ketentuan}</td>
                        <td className="px-3 py-2 text-slate-600">{row.nilai}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] italic text-slate-500">
                Penanggung jawab: Pengawas Lapangan / Admin SDM. Lembur hari libur resmi dikecualikan
                dari batas mingguan &amp; bulanan.
              </p>
            </div>
          )}
        </Card>

        {/* Info tambahan */}
        <Card className="p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <User className="w-3.5 h-3.5" /> Dibuat oleh{' '}
            <span className="font-semibold text-slate-700">{spkl.requester.name}</span> (
            {spkl.requester.email})
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" /> Terakhir diperbarui {formatDateTime(spkl.updatedAt)}
          </div>
          {spkl.notes && (
            <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <span className="font-bold uppercase tracking-wide text-[10px]">Catatan internal: </span>
              {spkl.notes}
            </div>
          )}
        </Card>
      </div>

      {/* ===================== TEMPLATE CETAK ===================== */}
      <SpklPrintTemplate spkl={spkl} />

      {/* Modal tolak */}
      <Modal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Tolak SPKL"
        description="Alasan penolakan wajib diisi dan akan tampil pada detail SPKL."
        maxWidth="lg"
      >
        <div className="space-y-3">
          {rejectError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {rejectError}
            </div>
          )}
          <label htmlFor="spkl-reject-reason" className="block text-xs font-semibold text-slate-700">
            Alasan penolakan <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="spkl-reject-reason"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
            rows={4}
            placeholder="Contoh: rincian uraian tugas belum sesuai dengan rencana kerja."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy !== null || !rejectReason.trim()}
              onClick={() => {
                if (!rejectReason.trim()) {
                  setRejectError('Alasan penolakan wajib diisi.');
                  return;
                }
                changeStatus('REJECTED', rejectReason.trim());
              }}
            >
              {busy === 'REJECTED' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              Tolak SPKL
            </Button>
          </div>
        </div>
      </Modal>
    </React.Fragment>
  );
}
