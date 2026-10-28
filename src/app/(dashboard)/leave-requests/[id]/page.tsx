'use client';

import React, { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/ui/Badge';
import { CalendarRangePicker } from '@/components/ui/CalendarRangePicker';
import { SignedDocumentCard } from '@/components/documents/SignedDocumentCard';
import { formatDate } from '@/lib/utils';
import {
  ArrowLeft,
  Calendar,
  CalendarRange,
  CheckCircle,
  XCircle,
  Clock,
  User,
  FileText,
  Paperclip,
  CheckCircle2,
  Edit,
  Printer,
  AlertTriangle,
  Info,
  Sparkles,
  Mail,
  Shield,
  Upload,
} from 'lucide-react';
import Link from 'next/link';

interface LeaveRequestDetail {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  attachmentUrl?: string | null;
  status: 'ON_PROGRESS' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'DONE';
  adminNote?: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    nip?: string | null;
    workUnit?: string | null;
    name: string;
    email: string;
    role: string;
    gender: 'MALE' | 'FEMALE';
    quota?: {
      totalQuota: number;
      usedQuota: number;
    } | null;
  };
  requestTypes: Array<{
    leaveType: {
      id: string;
      name: string;
      category: string;
      calculationType: string;
      daysDescription?: string | null;
    };
  }>;
  // Segmen multi-rentang (satu pengajuan = daftar rentang, tiap rentang punya jenis cuti sendiri)
  segments?: Array<{
    id?: string;
    leaveTypeId: string;
    totalDays: number;
    startDate: string;
    endDate: string;
    order?: number;
    leaveType?: {
      id: string;
      name: string;
      category?: string;
    } | null;
  }>;
  /**
   * Rincian kuota akurat dari backend (dihitung dari tabel `leave_quota_histories`,
   * bukan tebakan frontend). Sumber utama blok "Rincian Kuota Pengajuan Ini".
   * Opsional supaya tetap aman bila API lama / data lama tidak mengirimnya.
   */
  quotaInfo?: {
    perType: Array<{
      leaveTypeId: string;
      leaveTypeName: string;
      daysRequested: number;
      previousRemaining: number | null;
      usedByThisRequest: number;
      remainingAfter: number | null;
      currentRemaining: number | null;
    }>;
    totalDaysRequested: number;
    totalUsedByThisRequest: number;
    statusAffectsQuota: boolean;
  } | null;
}

interface HolidayDetail {
  date: string;
  name: string;
}

/** Baris ringkas GET /api/leave-requests (untuk menandai tanggal yang sudah dipakai). */
interface LeaveRequestListRow {
  id: string;
  status: string;
  startDate: string;
  endDate: string;
  requestTypes?: Array<{ leaveType?: { name?: string | null } | null }>;
  segments?: Array<{
    startDate: string;
    endDate: string;
    leaveType?: { name?: string | null } | null;
  }>;
}

export default function LeaveRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const requestId = resolvedParams.id;
  const router = useRouter();

  const [requestDetail, setRequestDetail] = useState<LeaveRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<'USER' | 'ADMIN'>('USER');
  /** Id user login — dipakai untuk mengecek kepemilikan pengajuan (upload dokumen). */
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  /**
   * Master penanda tangan cuti (GET /api/cuti-signers?active=1).
   * Dipakai pada blok tanda tangan Mengetahui & Menyetujui di template cetak.
   */
  const [cutiSigners, setCutiSigners] = useState<
    Array<{
      role: 'KNOWING' | 'APPROVER';
      name: string;
      nip: string | null;
      position: string | null;
      isDefault: boolean;
      sortOrder: number;
    }>
  >([]);

  // Status Action Modal State
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<'APPROVED' | 'REJECTED' | 'CANCELLED' | 'DONE'>('DONE');
  const [adminNote, setAdminNote] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Holiday Breakdown State
  const [allHolidays, setAllHolidays] = useState<HolidayDetail[]>([]);
  const [userBookedDates, setUserBookedDates] = useState<Array<{ date: string; leaveType: string }>>([]);
  const [holidaysInRange, setHolidaysInRange] = useState<HolidayDetail[]>([]);
  const [weekendDaysCount, setWeekendDaysCount] = useState<number>(0);

  // Kuota per jenis cuti milik pemohon (tabel UserLeaveQuota via GET /api/quotas/<userId>)
  const [typeQuotas, setTypeQuotas] = useState<
    Record<string, { totalQuota: number; usedQuota: number; borrowedQuota: number; year: number }>
  >({});

  const safeParseJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text && text.trim().length > 0 ? JSON.parse(text) : {};
    } catch {
      return { success: false, message: 'Respon tidak valid' };
    }
  };

  const fetchDetail = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [resReq, resMe, resHolidays, resRequests, resSigners] = await Promise.all([
        fetch(`/api/leave-requests/${requestId}`),
        fetch('/api/auth/me'),
        fetch('/api/holidays'),
        fetch('/api/leave-requests'),
        fetch('/api/cuti-signers?active=1'),
      ]);

      const jsonReq = await safeParseJson(resReq);
      const jsonMe = await safeParseJson(resMe);
      const jsonHolidays = await safeParseJson(resHolidays);
      const jsonRequests = await safeParseJson(resRequests);
      const jsonSigners = await safeParseJson(resSigners);

      if (!resReq.ok || !jsonReq.success || !jsonReq.data) {
        throw new Error(jsonReq.message || 'Pengajuan cuti tidak ditemukan');
      }

      setRequestDetail(jsonReq.data);

      // Kuota per jenis cuti milik pemohon — sumber utama rincian kuota di halaman ini
      const ownerId = jsonReq.data.user?.id ?? jsonReq.data.userId;
      const requestYear =
        Number(String(jsonReq.data.startDate).slice(0, 4)) || new Date().getFullYear();
      if (ownerId) {
        try {
          const jsonQuotas = await safeParseJson(
            await fetch(`/api/quotas/${ownerId}?year=${requestYear}`)
          );
          if (jsonQuotas.success && Array.isArray(jsonQuotas.data)) {
            const map: Record<
              string,
              { totalQuota: number; usedQuota: number; borrowedQuota: number; year: number }
            > = {};
            jsonQuotas.data.forEach(
              (q: {
                leaveTypeId: string;
                totalQuota: number;
                usedQuota: number;
                borrowedQuota?: number;
                year: number;
              }) => {
                map[q.leaveTypeId] = {
                  totalQuota: q.totalQuota,
                  usedQuota: q.usedQuota,
                  borrowedQuota: q.borrowedQuota ?? 0,
                  year: q.year,
                };
              }
            );
            setTypeQuotas(map);
          }
        } catch (quotaErr) {
          console.error('Gagal mengambil kuota per jenis cuti:', quotaErr);
        }
      }

      if (jsonMe.success && jsonMe.data) {
        setCurrentUserRole(jsonMe.data.role);
        setCurrentUserId(jsonMe.data.id ?? null);
      }

      if (jsonSigners.success && Array.isArray(jsonSigners.data)) {
        setCutiSigners(
          jsonSigners.data
            .filter(
              (signer: { role?: string }) =>
                signer.role === 'KNOWING' || signer.role === 'APPROVER'
            )
            .map((signer: {
              role: 'KNOWING' | 'APPROVER';
              name: string;
              nip?: string | null;
              position?: string | null;
              isDefault?: boolean;
              sortOrder?: number;
            }) => ({
              role: signer.role,
              name: signer.name,
              nip: signer.nip ?? null,
              position: signer.position ?? null,
              isDefault: signer.isDefault ?? false,
              sortOrder: signer.sortOrder ?? 0,
            }))
        );
      }

      if (jsonHolidays.success && Array.isArray(jsonHolidays.data)) {
        setAllHolidays(
          jsonHolidays.data.map((h: any) => ({
            date: String(h.date).split('T')[0],
            name: h.name,
          }))
        );
      }

      if (jsonRequests.success && Array.isArray(jsonRequests.data)) {
        const bookedList: Array<{ date: string; leaveType: string }> = [];
        jsonRequests.data.forEach((req: LeaveRequestListRow) => {
          if (req.id !== requestId && (req.status === 'ON_PROGRESS' || req.status === 'APPROVED')) {
            // Tandai per rentang (segments) agar celah antar rentang tidak ikut ditandai.
            const ranges: Array<{ startDate: string; endDate: string; leaveTypeName: string }> =
              Array.isArray(req.segments) && req.segments.length > 0
                ? req.segments.map((s) => ({
                    startDate: String(s.startDate).split('T')[0],
                    endDate: String(s.endDate).split('T')[0],
                    leaveTypeName: s.leaveType?.name || 'Cuti',
                  }))
                : [
                    {
                      startDate: String(req.startDate).split('T')[0],
                      endDate: String(req.endDate).split('T')[0],
                      leaveTypeName: req.requestTypes?.[0]?.leaveType?.name || 'Cuti',
                    },
                  ];

            ranges.forEach((range) => {
              const curr = new Date(`${range.startDate}T00:00:00`);
              const end = new Date(`${range.endDate}T00:00:00`);
              while (curr <= end) {
                const year = curr.getFullYear();
                const month = String(curr.getMonth() + 1).padStart(2, '0');
                const day = String(curr.getDate()).padStart(2, '0');
                bookedList.push({
                  date: `${year}-${month}-${day}`,
                  leaveType: range.leaveTypeName,
                });
                curr.setDate(curr.getDate() + 1);
              }
            });
          }
        });
        setUserBookedDates(bookedList);
      }

      // Hitung rincian hari libur: pakai segments[] bila ada (multi-rentang), selain itu bentuk lama.
      const detailSegments: NonNullable<LeaveRequestDetail['segments']> = jsonReq.data.segments ?? [];
      const calcPayload =
        detailSegments.length > 0
          ? {
              segments: detailSegments.map((s) => ({
                leaveTypeId: s.leaveTypeId,
                startDate: String(s.startDate).split('T')[0],
                endDate: String(s.endDate).split('T')[0],
              })),
            }
          : jsonReq.data.requestTypes?.[0]?.leaveType?.id
          ? {
              leaveTypeIds: [jsonReq.data.requestTypes[0].leaveType.id],
              startDate: String(jsonReq.data.startDate).split('T')[0],
              endDate: String(jsonReq.data.endDate).split('T')[0],
            }
          : null;

      if (calcPayload) {
        try {
          const resCalc = await fetch('/api/leave-requests/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(calcPayload),
          });
          const jsonCalc = await safeParseJson(resCalc);
          if (jsonCalc.success) {
            setHolidaysInRange(jsonCalc.holidaysInRange ?? []);
            setWeekendDaysCount(jsonCalc.weekendDaysCount ?? 0);
          }
        } catch (calcErr) {
          console.error('Error fetching calculation breakdown:', calcErr);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [requestId]);

  const handleUpdateStatus = async () => {
    setSubmittingStatus(true);
    try {
      const res = await fetch(`/api/leave-requests/${requestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus, adminNote }),
      });

      const json = await safeParseJson(res);
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengubah status pengajuan');
      }

      setStatusModalOpen(false);
      fetchDetail();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-slate-500 font-semibold text-sm">
        Memuat detail pengajuan cuti...
      </div>
    );
  }

  if (errorMsg || !requestDetail) {
    return (
      <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 space-y-4 max-w-2xl mx-auto my-8">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />
          <h2 className="text-lg font-bold text-rose-950">Gagal Memuat Detail</h2>
        </div>
        <p className="text-xs">{errorMsg || 'Pengajuan cuti tidak ditemukan.'}</p>
        <Link href="/dashboard">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4" /> Kembali ke Dashboard
          </Button>
        </Link>
      </div>
    );
  }

  const startDateStr = requestDetail.startDate.split('T')[0];
  const endDateStr = requestDetail.endDate.split('T')[0];
  // Dokumen tanda tangan: ADMIN boleh upload ke pengajuan siapa pun, USER hanya
  // ke pengajuan miliknya; hapus dokumen tetap ADMIN saja (aturan backend sama).
  const canUploadSignedDocument =
    currentUserRole === 'ADMIN' || (!!currentUserId && currentUserId === requestDetail.userId);
  const canDeleteSignedDocument = currentUserRole === 'ADMIN';
  const leaveType = requestDetail.requestTypes?.[0]?.leaveType;
  const userObj = requestDetail.user;
  const detailSegments = requestDetail.segments ?? [];
  const hasSegments = detailSegments.length > 0;

  // Daftar rentang tanggal: dari segments[] (multi-rentang) atau rentang tunggal (pengajuan lama).
  const segmentRows = hasSegments
    ? detailSegments.map((segment, index) => ({
        no: index + 1,
        typeId: segment.leaveTypeId,
        typeName:
          segment.leaveType?.name ||
          requestDetail.requestTypes?.find((rt) => rt.leaveType.id === segment.leaveTypeId)?.leaveType
            .name ||
          'Jenis cuti',
        startDate: String(segment.startDate).split('T')[0],
        endDate: String(segment.endDate).split('T')[0],
        days: Number(segment.totalDays) || 0,
      }))
    : [
        {
          no: 1,
          typeId: leaveType?.id ?? '',
          typeName: leaveType?.name || 'Cuti',
          startDate: startDateStr,
          endDate: endDateStr,
          days: requestDetail.totalDays,
        },
      ];

  // Hari per jenis cuti (dipakai untuk rincian kuota per jenis).
  const daysByType = new Map<string, number>();
  segmentRows.forEach((row) => {
    if (!row.typeId) return;
    daysByType.set(row.typeId, (daysByType.get(row.typeId) ?? 0) + row.days);
  });

  // Rincian kuota SESUAI JENIS CUTI pengajuan.
  //
  // SUMBER UTAMA: `requestDetail.quotaInfo` dari GET /api/leave-requests/[id].
  // Backend menghitungnya dari tabel `leave_quota_histories` (snapshot per pengajuan),
  // jadi tetap benar walaupun ada pemotongan LAIN setelah pengajuan ini.
  // JANGAN hitung ulang angka kuota di frontend.
  //
  // Fallback (hanya bila quotaInfo tidak dikirim API lama) memakai perhitungan kasar
  // lama — perhatikan itu menganggap pengajuan ini pemotongan terakhir.
  const quotaInfo = requestDetail.quotaInfo ?? null;
  const quotaInfoByType = new Map(
    (quotaInfo?.perType ?? []).map((info) => [info.leaveTypeId, info] as const)
  );
  // true = pengajuan ini benar-benar memotong kuota (APPROVED/DONE + ada history).
  const quotaAffected = !!quotaInfo?.statusAffectsQuota;

  const isQuotaCut =
    requestDetail.status === 'APPROVED' || requestDetail.status === 'DONE';
  const isQuotaPending = requestDetail.status === 'ON_PROGRESS';
  const isQuotaVoid =
    requestDetail.status === 'REJECTED' || requestDetail.status === 'CANCELLED';

  const quotaRows = (requestDetail.requestTypes ?? []).map((rt) => {
    const quota = typeQuotas[rt.leaveType.id];
    const info = quotaInfoByType.get(rt.leaveType.id);
    const isUnlimited = !!quota && quota.totalQuota >= 999;
    // Hari jenis cuti ini pada pengajuan (agregat semua rentang dengan jenis yang sama).
    const daysForType = hasSegments
      ? daysByType.get(rt.leaveType.id) ?? 0
      : requestDetail.totalDays;

    let previousRemaining: number | null;
    let remainingAfter: number | null;
    /** null = pengajuan ini tidak memotong kuota (tampil "—"). */
    let usedByThisRequest: number | null;
    let currentRemaining: number | null;
    /** true = "sisa sesudah" masih proyeksi (ON_PROGRESS). */
    let isProjected = false;

    if (info) {
      // ---- Jalur utama: angka dari backend (quotaInfo), tanpa hitung ulang ----
      previousRemaining = info.previousRemaining;
      currentRemaining = info.currentRemaining;
      usedByThisRequest = quotaAffected ? info.usedByThisRequest : null;

      if (quotaAffected) {
        remainingAfter = info.remainingAfter;
      } else if (isQuotaPending) {
        // Kuota belum dipotong: tampilkan proyeksi bila pengajuan disetujui.
        const base = info.previousRemaining;
        const cut = info.daysRequested || daysForType;
        remainingAfter = base === null ? null : base - cut;
        isProjected = true;
      } else {
        // REJECTED / CANCELLED: kuota tidak terpotong → sisa sesudah = sisa sebelum.
        remainingAfter = info.previousRemaining;
      }
    } else {
      // ---- FALLBACK (hanya bila API tidak mengirim quotaInfo) ----
      // Perhitungan kasar: menganggap pengajuan ini pemotongan TERAKHIR.
      const remainingNow = quota ? quota.totalQuota - quota.usedQuota : null;
      const cutDays = isQuotaCut ? daysForType : 0;
      const projectedDays = isQuotaCut || isQuotaPending ? daysForType : 0;
      previousRemaining = remainingNow === null ? null : remainingNow + cutDays;
      remainingAfter = previousRemaining === null ? null : previousRemaining - projectedDays;
      usedByThisRequest = cutDays > 0 ? daysForType : null;
      currentRemaining = remainingNow;
      isProjected = isQuotaPending;
    }

    const hasQuota = !!quota || !!info;

    let note = '';
    if (!hasQuota) {
      note = 'Data kuota jenis cuti ini belum tersedia pada tahun pengajuan.';
    } else if (isUnlimited) {
      note = 'Jenis cuti ini tidak dibatasi kuota.';
    } else if (isQuotaVoid) {
      note = `Status ${requestDetail.status}: kuota tidak terpotong, sisa sesudah sama dengan sisa sebelum.`;
    } else if (isQuotaPending) {
      note = `Status ON_PROGRESS: kuota belum dipotong. Jika pengajuan disetujui, sisa menjadi ${remainingAfter} hari.`;
    } else if (usedByThisRequest !== null) {
      note = `Status ${requestDetail.status}: kuota sudah terpotong ${usedByThisRequest} hari untuk pengajuan ini.`;
    } else {
      note = `Status ${requestDetail.status}: kuota belum dipotong untuk pengajuan ini.`;
    }

    return {
      typeId: rt.leaveType.id,
      name: rt.leaveType.name,
      days: daysForType,
      totalQuota: quota ? quota.totalQuota : null,
      /** Terpakai DI PENGAJUAN INI (bukan usedQuota global). */
      usedByThisRequest,
      remainingBefore: previousRemaining,
      remainingAfter,
      currentRemaining,
      isProjected,
      isUnlimited,
      hasQuota,
      isOver: remainingAfter !== null && !isUnlimited && remainingAfter < 0,
      note,
    };
  });

  const primaryQuota = quotaRows[0];
  const calendarRanges = segmentRows.map((row) => ({
    startDate: row.startDate,
    endDate: row.endDate,
  }));




  return (
    <React.Fragment>
      {/* Global Print CSS — uses border-collapse: separate with 0 spacing to guarantee crisp 1px borders in all print engines */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          .official-print-template,
          .official-print-template * {
            visibility: visible !important;
          }
          .official-print-template {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 6px 20px !important;
            background: white !important;
            color: black !important;
            font-family: Arial, Helvetica, sans-serif !important;
          }
          .official-print-template table.grid-table {
            border-collapse: separate !important;
            border-spacing: 0 !important;
            border-top: 1px solid #000000 !important;
            border-left: 1px solid #000000 !important;
          }
          .official-print-template table.grid-table td,
          .official-print-template table.grid-table th {
            border-right: 1px solid #000000 !important;
            border-bottom: 1px solid #000000 !important;
            border-top: 0 !important;
            border-left: 0 !important;
            empty-cells: show !important;
            box-sizing: border-box !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 15mm;
          }
        }
      ` }} />

      {/* SCREEN READABLE INTERFACE */}
      <div className="w-full space-y-6 print:hidden">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href={currentUserRole === 'ADMIN' ? '/admin/leave-requests' : '/dashboard'}>
              <Button variant="outline" size="sm" className="rounded-lg">
                <ArrowLeft className="w-4 h-4" /> Kembali
              </Button>
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Detail Pengajuan Cuti
                </h1>
                <StatusBadge status={requestDetail.status} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                ID Pengajuan: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-indigo-900">#{requestDetail.id}</code>
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Edit Data Cuti */}
            {requestDetail.status !== 'CANCELLED' && requestDetail.status !== 'DONE' && (
              <Link href={currentUserRole === 'ADMIN' ? `/admin/leave-requests/${requestId}/edit` : `/leave-requests/${requestId}/edit`}>
                <Button variant="outline" size="sm" className="border-indigo-300 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-bold">
                  <Edit className="w-4 h-4" /> Edit Data Cuti
                </Button>
              </Link>
            )}

            {/* 2. Tandai Selesai (DONE) */}
            {requestDetail.status !== 'DONE' && requestDetail.status !== 'CANCELLED' && requestDetail.status !== 'REJECTED' && (
              <Button
                onClick={() => {
                  setTargetStatus('DONE');
                  setStatusModalOpen(true);
                }}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                <CheckCircle2 className="w-4 h-4" /> Tandai Selesai (DONE)
              </Button>
            )}

            {/* 3. Cetak Detail */}
            <Button onClick={() => window.print()} variant="outline" size="sm" className="font-bold border-slate-300">
              <Printer className="w-4 h-4 text-slate-700" /> Cetak Detail Form Resmi
            </Button>

            {/* 4. Batalkan Pengajuan */}
            {requestDetail.status !== 'CANCELLED' && requestDetail.status !== 'DONE' && (
              <Button
                onClick={() => {
                  setTargetStatus('CANCELLED');
                  setStatusModalOpen(true);
                }}
                variant="outline"
                size="sm"
                className="border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100"
              >
                Batalkan Pengajuan
              </Button>
            )}
          </div>
        </div>

        {/* Main Full Width Detail Container Card */}
        <Card className="w-full p-6 md:p-8 border border-slate-200 shadow-sm space-y-8">
          {/* Section 1: Informasi Karyawan (Profil Pemohon) */}
          <div className="w-full">
            <h3 className="text-xs font-black uppercase tracking-wider text-indigo-700 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" /> Informasi Karyawan Pemohon
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 bg-slate-50/80 p-5 rounded-2xl border border-slate-200/80">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Nomor Pegawai (NIP)
                </span>
                <p className="text-sm font-extrabold font-mono text-indigo-900 mt-1">{userObj.nip || '-'}</p>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Nama Lengkap
                </span>
                <p className="text-sm font-extrabold text-slate-900 mt-1">{userObj.name}</p>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Satuan Kerja / Unit Kerja
                </span>
                <p className="text-sm font-extrabold text-slate-800 mt-1">{userObj.workUnit || '-'}</p>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Email Perusahaan
                </span>
                <p className="text-sm font-semibold text-slate-800 mt-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> {userObj.email}
                </p>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Peran & Gender
                </span>
                <p className="text-sm font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-indigo-600" />
                  {userObj.role === 'ADMIN' ? 'HR Admin' : 'Karyawan'}
                  <span className="text-slate-400">•</span>
                  <span className="text-indigo-900">
                    {userObj.gender === 'FEMALE' ? 'Perempuan ♀' : 'Laki-laki ♂'}
                  </span>
                </p>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Sisa Kuota Saat Ini Sesuai Jenis Cuti
                </span>
                {quotaRows.length === 0 ? (
                  <p className="text-sm font-black text-slate-500 mt-1">Sesuai ketentuan</p>
                ) : (
                  quotaRows.map((row) => (
                    <p key={row.typeId} className="text-sm font-black text-indigo-900 mt-1">
                      {row.isUnlimited
                        ? 'Tidak dibatasi'
                        : !row.hasQuota || row.currentRemaining === null
                        ? 'Belum ada data'
                        : `${row.currentRemaining} Hari`}
                      <span className="text-[11px] font-semibold text-slate-500"> • {row.name}</span>
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Daftar Rentang Tanggal (multi-rentang) */}
          <div className="w-full space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-700 flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-indigo-600" /> Daftar Rentang Tanggal
              </h3>
              <span
                data-testid="detail-segment-summary"
                className="text-xs font-extrabold text-indigo-900 bg-indigo-100 px-3 py-1 rounded-lg border border-indigo-200"
              >
                {segmentRows.length} rentang · total {requestDetail.totalDays} hari kerja
              </span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-black uppercase tracking-wider w-12">No</th>
                    <th className="px-3 py-2.5 text-left font-black uppercase tracking-wider">Jenis Cuti</th>
                    <th className="px-3 py-2.5 text-left font-black uppercase tracking-wider">Tanggal Mulai</th>
                    <th className="px-3 py-2.5 text-left font-black uppercase tracking-wider">Tanggal Selesai</th>
                    <th className="px-3 py-2.5 text-right font-black uppercase tracking-wider">Hari</th>
                  </tr>
                </thead>
                <tbody>
                  {segmentRows.map((row) => (
                    <tr
                      key={`${row.no}-${row.typeId}-${row.startDate}`}
                      data-testid={`detail-segment-${row.no}`}
                      className="border-t border-slate-100"
                    >
                      <td className="px-3 py-2 font-bold text-slate-500">{row.no}</td>
                      <td className="px-3 py-2 font-extrabold text-slate-900">{row.typeName}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{formatDate(row.startDate)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{formatDate(row.endDate)}</td>
                      <td className="px-3 py-2 text-right font-black text-indigo-800">{row.days} hari</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-indigo-50/60">
                    <td colSpan={4} className="px-3 py-2 text-right font-black text-slate-700 uppercase tracking-wider">
                      Total Hari Kerja
                    </td>
                    <td className="px-3 py-2 text-right font-black text-indigo-900">
                      {requestDetail.totalDays} hari
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Dokumen tanda tangan — PDF hasil scan disimpan di Google Drive */}
          <SignedDocumentCard
            entityType="LEAVE_REQUEST"
            entityId={requestDetail.id}
            canUpload={canUploadSignedDocument}
            canDelete={canDeleteSignedDocument}
          />

          {/* Section 3: Detail Jenis Cuti */}
          <div className="w-full space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-indigo-700 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-600" /> Detail Jenis Cuti & Ketentuan
            </h3>

            <div className="bg-indigo-50/60 p-5 rounded-2xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                  Jenis Cuti Terpilih
                </span>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {quotaRows.length === 0 ? (
                    <h4 className="text-lg font-black text-indigo-950">{leaveType?.name || 'Cuti'}</h4>
                  ) : (
                    quotaRows.map((row) => (
                      <h4
                        key={row.typeId}
                        className="text-base font-black text-indigo-950 bg-white border border-indigo-200 px-3 py-1 rounded-lg"
                      >
                        {row.name}
                      </h4>
                    ))
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1.5">
                  Kategori: <strong>{leaveType?.category === 'CUTI' ? 'Cuti Resmi' : 'Izin Meninggalkan'}</strong> • Ketentuan: <strong>{leaveType?.daysDescription || 'Hari Kerja'}</strong>
                </p>
              </div>

              <div className="bg-white px-4 py-2.5 rounded-xl border border-indigo-200 shadow-2xs text-right">
                <span className="text-[11px] text-slate-500 font-semibold block">
                  {quotaRows.length > 1 ? 'Jenis Cuti Dipakai' : `Total Kuota ${primaryQuota?.name || 'Jenis Cuti Ini'}`}
                </span>
                <span className="text-base font-black text-indigo-900">
                  {quotaRows.length > 1
                    ? `${quotaRows.length} jenis`
                    : primaryQuota
                    ? primaryQuota.isUnlimited
                      ? 'Tidak dibatasi'
                      : primaryQuota.hasQuota
                      ? `${primaryQuota.totalQuota} Hari`
                      : 'Sesuai Ketentuan'
                    : 'Sesuai Ketentuan'}
                </span>
              </div>
            </div>

            {/* Rincian kuota per jenis cuti pengajuan (dipakai / sisa sebelum / sisa sesudah) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-600" /> Rincian Kuota Pengajuan Ini
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  Durasi pengajuan: {requestDetail.totalDays} hari
                </span>
              </div>

              {quotaRows.length === 0 ? (
                <p className="text-xs text-slate-500 font-medium">
                  Jenis cuti pengajuan ini belum tercatat.
                </p>
              ) : (
                quotaRows.map((row, rowIdx) => (
                  <div
                    key={row.typeId}
                    data-testid={`quota-detail-${rowIdx}`}
                    className={`rounded-xl border p-3 space-y-2 ${
                      row.isOver ? 'bg-rose-50/80 border-rose-300' : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-900">{row.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                          Pengajuan ini: {row.days} hari
                        </span>
                        <span className="text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                          Tahun {typeQuotas[row.typeId]?.year ?? startDateStr.slice(0, 4)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Terpakai di pengajuan ini
                        </span>
                        <span
                          data-testid={`quota-used-${rowIdx}`}
                          className="block text-sm font-black text-slate-800"
                        >
                          {row.isUnlimited
                            ? 'Tidak dibatasi'
                            : !row.hasQuota
                            ? '-'
                            : row.usedByThisRequest === null
                            ? '—'
                            : `${row.usedByThisRequest} Hari`}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200">
                        <span className="block text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                          Sisa sebelum
                        </span>
                        <span
                          data-testid={`quota-before-${rowIdx}`}
                          className="block text-sm font-black text-indigo-900"
                        >
                          {row.isUnlimited
                            ? 'Tidak dibatasi'
                            : row.hasQuota
                            ? `${row.remainingBefore} Hari`
                            : 'Belum ada data'}
                        </span>
                        {!row.isUnlimited && row.hasQuota && row.totalQuota !== null && (
                          <span className="block text-[10px] text-slate-500 font-semibold">
                            dari {row.totalQuota} hari
                          </span>
                        )}
                      </div>

                      <div
                        className={`p-2.5 rounded-lg border ${
                          row.isOver
                            ? 'bg-rose-100 border-rose-300'
                            : 'bg-emerald-50 border-emerald-200'
                        }`}
                      >
                        <span
                          className={`block text-[10px] font-bold uppercase tracking-wider ${
                            row.isOver ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          Sisa sesudah
                        </span>
                        <span
                          data-testid={`quota-after-${rowIdx}`}
                          className={`block text-sm font-black ${
                            row.isOver ? 'text-rose-700' : 'text-emerald-900'
                          }`}
                        >
                          {row.isUnlimited
                            ? 'Tidak dibatasi'
                            : row.hasQuota
                            ? `${row.remainingAfter} Hari`
                            : '-'}
                        </span>
                        {row.isProjected && !row.isUnlimited && row.hasQuota && (
                          <span className="block text-[10px] text-slate-500 font-semibold">
                            proyeksi bila disetujui
                          </span>
                        )}
                        {!row.isUnlimited && row.hasQuota && row.currentRemaining !== null && (
                          <span
                            data-testid={`quota-current-${rowIdx}`}
                            className="block text-[10px] text-slate-600 font-bold"
                          >
                            Saldo saat ini: {row.currentRemaining} hari
                          </span>
                        )}
                        {row.isOver && (
                          <span className="block text-[10px] text-rose-700 font-extrabold">
                            ⚠ Kuota tidak cukup
                          </span>
                        )}
                      </div>
                    </div>

                    {row.note && (
                      <p
                        className={`text-[11px] font-semibold rounded-lg p-2 border ${
                          row.hasQuota
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}
                      >
                        {row.note}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Section 4: Kalender semua rentang & perhitungan */}
          <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-indigo-700 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" /> Periode Tanggal Pada Kalender
              </h3>
              <span className="text-xs font-extrabold text-indigo-900 bg-indigo-100 px-3 py-1 rounded-lg border border-indigo-200">
                {segmentRows.length} rentang · {formatDate(startDateStr)} — {formatDate(endDateStr)}
              </span>
            </div>

            {/* Visual Calendar Component — menandai gabungan semua rentang */}
            <CalendarRangePicker
              ranges={calendarRanges}
              holidays={allHolidays}
              bookedDates={userBookedDates}
            />

            {/* High-Contrast Duration Summary Banner */}
            <div className="p-5 rounded-2xl bg-indigo-600 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md border-2 border-indigo-700">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center font-black text-white shrink-0">
                  <Sparkles className="w-6 h-6 text-amber-300" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-100">
                    Total Durasi Cuti Disetujui
                  </h4>
                  <p className="text-xs text-indigo-100 font-medium">
                    Akumulasi hari kerja efektif dari {segmentRows.length} rentang tanggal
                  </p>
                </div>
              </div>

              <div className="flex items-baseline gap-2 bg-white text-indigo-950 px-6 py-2.5 rounded-xl font-black shadow-sm">
                <span data-testid="detail-total-days" className="text-3xl font-black text-indigo-600">
                  {requestDetail.totalDays}
                </span>
                <span className="text-base font-extrabold text-slate-800">Hari Kerja</span>
              </div>
            </div>

            {/* Holidays Breakdown */}
            {(holidaysInRange.length > 0 || weekendDaysCount > 0) && (
              <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-200 space-y-3 w-full">
                <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2">
                  <span className="text-xs font-extrabold text-indigo-950 flex items-center gap-2">
                    <Info className="w-4 h-4 text-indigo-600" /> Rincian Hari Libur Terdeteksi pada Kalender:
                  </span>
                  <span className="text-xs font-bold text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-full border border-indigo-200">
                    Bukan Hari Kerja (Tidak Memotong Kuota)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {holidaysInRange.map((h) => (
                    <div
                      key={h.date}
                      className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-rose-600 shrink-0" />
                        <div>
                          <span className="font-extrabold text-rose-950 text-sm">{formatDate(h.date)}</span>
                          <p className="text-xs font-bold text-rose-800">{h.name}</p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-rose-600 text-white">
                        🔴 Libur Nasional
                      </span>
                    </div>
                  ))}

                  {weekendDaysCount > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-amber-600 shrink-0" />
                        <div>
                          <span className="font-extrabold text-amber-950 text-sm">Akhir Pekan (Sabtu & Minggu)</span>
                          <p className="text-xs font-bold text-amber-800">
                            Terdeteksi {weekendDaysCount} hari akhir pekan
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-amber-600 text-white">
                        Libur Weekend
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Keterangan / Alasan & Lampiran */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full pt-4 border-t border-slate-100">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">
                Keterangan / Alasan Cuti
              </h3>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs leading-relaxed font-medium">
                {requestDetail.reason}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
                <Paperclip className="w-3.5 h-3.5 text-slate-500" /> Lampiran Dokumen Pendukung
              </h3>
              {requestDetail.attachmentUrl ? (
                <a
                  href={requestDetail.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-bold flex items-center justify-between hover:bg-indigo-100 transition-colors"
                >
                  <span className="truncate pr-2">📄 {requestDetail.attachmentUrl}</span>
                  <span className="text-indigo-600 underline shrink-0">Buka Lampiran ↗</span>
                </a>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 text-xs italic">
                  Tidak ada lampiran dokumen pendukung yang diunggah.
                </div>
              )}
            </div>
          </div>

          {/* Section 5: Admin Note & Audit Timestamps */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            {requestDetail.adminNote && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                <span className="font-extrabold uppercase tracking-wider block text-amber-950">
                  Catatan Admin HR:
                </span>
                <p className="font-medium">{requestDetail.adminNote}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 text-[11px] text-slate-400 font-semibold pt-2">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Dibuat pada: {formatDate(requestDetail.createdAt)}
              </span>
              <span>Terakhir diperbarui: {formatDate(requestDetail.updatedAt)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 🖨️ PRINT TEMPLATE — rendered as raw HTML to fully bypass React/Tailwind CSS interference */}
      <div
        className="official-print-template hidden print:block"
        dangerouslySetInnerHTML={{ __html: (() => {
          const nip = userObj.nip || '-';
          const nama = userObj.name;
          const unit = userObj.workUnit || 'Joint Development Digitalisasi Aplikasi HCO';
          const esc = (s: string) => (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string));

          // ---- Blok tanda tangan: ambil dari Master Penanda Tangan Cuti ----
          // Default per role menang; kalau belum ada default, pakai baris aktif pertama.
          const pickSigner = (role: 'KNOWING' | 'APPROVER') =>
            cutiSigners.find((s) => s.role === role && s.isDefault) ??
            cutiSigners.find((s) => s.role === role) ??
            null;
          const knowingSigner = pickSigner('KNOWING');
          const approverSigner = pickSigner('APPROVER');
          /** Jabatan multi-baris tetap terpisah seperti template lama (fallback boleh berisi <br>). */
          const signerPositionHtml = (value: string | null | undefined, fallback: string) => {
            const raw = (value || fallback).replace(/<br\s*\/?>/gi, '\n');
            return esc(raw).replace(/\n/g, '<br>');
          };
          const approverPositionHtml = signerPositionHtml(
            approverSigner?.position,
            'Manajer Pengembangan Bisnis<br>& Operational Excellence'
          );
          const knowingPositionHtml = signerPositionHtml(
            knowingSigner?.position,
            'Application Development & Services/EIS<br>Department Head'
          );
          const approverName = esc(approverSigner?.name || 'Dedy Supriyatmoko');
          const approverNip = esc(approverSigner?.nip || '1082100018');
          const knowingName = esc(knowingSigner?.name || 'Dedek Apriyani');
          const knowingNip = esc(knowingSigner?.nip || '8913230864');

          // ---- Semua jenis cuti & rentang tanggal yang dipakai pengajuan ini ----
          // Sumber utama: segments[] (multi-rentang). Pengajuan lama tanpa segments memakai rentang tunggal.
          const usedTypesMap = new Map<
            string,
            {
              typeId: string;
              name: string;
              days: number;
              ranges: Array<{ startDate: string; endDate: string }>;
            }
          >();
          (requestDetail.segments ?? []).forEach((segment) => {
            const typeId = segment.leaveTypeId;
            const typeName =
              segment.leaveType?.name ||
              requestDetail.requestTypes?.find((rt) => rt.leaveType.id === typeId)?.leaveType.name ||
              'Jenis cuti';
            const entry = usedTypesMap.get(typeId) ?? { typeId, name: typeName, days: 0, ranges: [] };
            entry.days += Number(segment.totalDays) || 0;
            entry.ranges.push({
              startDate: String(segment.startDate).split('T')[0],
              endDate: String(segment.endDate).split('T')[0],
            });
            usedTypesMap.set(typeId, entry);
          });
          const usedTypes =
            usedTypesMap.size > 0
              ? Array.from(usedTypesMap.values())
              : (requestDetail.requestTypes ?? []).map((rt) => ({
                  typeId: rt.leaveType.id,
                  name: rt.leaveType.name,
                  days: requestDetail.totalDays,
                  ranges: [{ startDate: startDateStr, endDate: endDateStr }],
                }));

          const rangeText = (r: { startDate: string; endDate: string }) =>
            `${formatDate(r.startDate)} - ${formatDate(r.endDate)}`;

          /**
           * Tanda x + tanggal pelaksanaan untuk satu baris jenis cuti.
           * Bila satu jenis dipakai di beberapa rentang, semua rentang ditulis dalam satu sel
           * (mis. "01/10/2026 - 03/10/2026; 10/10/2026 - 11/10/2026").
           */
          const dateCells = (predicate: (name: string) => boolean) => {
            const ranges = usedTypes
              .filter((t) => predicate(t.name.toLowerCase()))
              .flatMap((t) => t.ranges);
            if (ranges.length === 0) return { mark: '', mulai: '', sampai: '', combined: '' };
            if (ranges.length === 1) {
              return {
                mark: 'x',
                mulai: formatDate(ranges[0].startDate),
                sampai: formatDate(ranges[0].endDate),
                combined: '',
              };
            }
            return { mark: 'x', mulai: '', sampai: '', combined: ranges.map(rangeText).join('; ') };
          };

          const inc = (match: string) => (name: string) => name.includes(match);
          const exact = (match: string) => (name: string) => name === match;
          const khitananBaptis = (name: string) => name.includes('khitanan') || name.includes('baptis');

          // Baris tabel Cuti
          const cutiRows = [
            { label: 'Cuti tahunan', ...dateCells(inc('tahunan')) },
            { label: 'Cuti gugur kandungan (45 hari kalender)', ...dateCells(exact('cuti gugur kandungan')) },
            { label: 'Cuti bersalin (3 bulan kalender)', ...dateCells(exact('cuti bersalin')) },
            { label: 'Cuti bersalin dengan keadaan khusus (3 bulan kalender)', ...dateCells(inc('keadaan khusus')) },
            { label: 'Cuti melaksanakan ibadah wajib keagamaan (sesuai ketentuan Agama/Pemerintah)', ...dateCells(inc('ibadah')) },
            { label: 'Pinjam Cuti', ...dateCells(inc('pinjam')) },
          ];

          // Baris tabel Izin Meninggalkan
          const izinRows = [
            { label: 'Pernikahan Pekerja (3 hari kerja)', ...dateCells(inc('pernikahan pekerja')) },
            { label: 'Pernikahan Anak (2 hari kerja)', ...dateCells(inc('pernikahan anak')) },
            { label: 'Khitanan/pembaptisan Anak (2 hari kerja)', ...dateCells(khitananBaptis) },
            { label: 'Istri melahirkan/keguguran (2 hari kerja)', ...dateCells(inc('istri melahirkan')) },
            { label: 'Keluarga Inti meninggal (Suami/Istri/Orang Tua/Mertua/Anak) (2 hari kerja)', ...dateCells(inc('keluarga inti meninggal')) },
            { label: 'Anggota keluarga dalam satu rumah meninggal (1 hari kerja)', ...dateCells(inc('anggota keluarga')) },
          ];

          const c = 'border-right:1px solid #000!important;border-bottom:1px solid #000!important;border-top:0!important;border-left:0!important;empty-cells:show!important;box-sizing:border-box!important;';
          const hdr = `${c}padding:4px;text-align:center;background-color:#002060;color:#fff;font-weight:bold;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact;`;
          const sub = `${c}padding:3px;text-align:center;font-style:italic;font-size:9px;font-weight:normal;background-color:#fff;color:#000;`;
          const xCell = `${c}width:28px;text-align:center;font-weight:bold;vertical-align:middle;`;
          const tCell = `${c}padding:2px 6px;vertical-align:middle;`;
          const dCell = `${c}width:105px;text-align:center;padding:2px;font-size:9px;vertical-align:middle;`;
          const mCell = `${c}width:105px;padding:3px;text-align:center;font-size:10px;background-color:#002060;color:#fff;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact;vertical-align:middle;`;

          // Baris tabel: satu sel tanggal bila hanya 1 rentang, sel gabungan (colspan) bila beberapa rentang.
          const rowHtml = (r: { mark: string; label: string; mulai: string; sampai: string; combined: string }) =>
            r.combined
              ? `<tr style="height:20px"><td style="${xCell}">${r.mark || '&nbsp;'}</td><td style="${tCell}">${r.label}</td><td colspan="2" style="${dCell}width:auto">${r.combined}</td></tr>`
              : `<tr style="height:20px"><td style="${xCell}">${r.mark || '&nbsp;'}</td><td style="${tCell}">${r.label}</td><td style="${dCell}">${r.mulai || '&nbsp;'}</td><td style="${dCell}">${r.sampai || '&nbsp;'}</td></tr>`;

          const cutiRowsHtml = cutiRows.map(rowHtml).join('');
          const izinRowsHtml = izinRows.map(rowHtml).join('');

          // ---- RINCIAN KUOTA PER JENIS CUTI ----
          // Memakai `quotaRows` yang SAMA dengan tampilan layar, yang bersumber dari
          // `requestDetail.quotaInfo` (dihitung backend dari `leave_quota_histories`).
          // Tidak ada perhitungan manual di jalur cetak supaya angka cetak = angka layar.
          const isVoid = requestDetail.status === 'REJECTED' || requestDetail.status === 'CANCELLED';

          const quotaPrint = quotaRows.map((row) => ({
            name: row.name,
            days: row.days,
            total: row.totalQuota,
            usedBefore: row.usedByThisRequest,
            before: row.remainingBefore,
            after: row.remainingAfter,
            projected: row.isProjected,
            unlimited: row.isUnlimited,
            missing: !row.hasQuota,
          }));

          const quotaCell = `${c}padding:2px 5px;vertical-align:middle;font-size:9.5px;`;
          const quotaHari = (v: number | null) => (v === null ? 'Sesuai Ketentuan' : `${v} hari`);

          const quotaPrintHtml = quotaPrint
            .map((row) => {
              const noQuota = row.missing || row.unlimited;
              const totalTxt = row.missing
                ? 'Sesuai Ketentuan'
                : row.unlimited
                ? 'Tidak dibatasi'
                : `${row.total} hari`;
              // "Kuota Terpakai" = hari yang dipotong OLEH pengajuan ini (usedByThisRequest),
              // bukan usedQuota global pemohon. "—" bila pengajuan tidak memotong kuota.
              const usedTxt = noQuota
                ? totalTxt
                : row.usedBefore === null
                ? '—'
                : `${row.usedBefore} hari`;
              const beforeTxt = noQuota ? totalTxt : quotaHari(row.before);
              const isOver = !noQuota && row.after !== null && row.after < 0;
              const afterTxt = noQuota
                ? totalTxt
                : `${quotaHari(row.after)}${row.projected ? ' (proyeksi)' : ''}${
                    isOver ? ' (melebihi kuota)' : ''
                  }`;

              return `<tr style="height:16px">
          <td style="${quotaCell}font-weight:bold">${esc(row.name)}</td>
          <td style="${quotaCell}text-align:center;font-weight:bold">${row.days} hari</td>
          <td style="${quotaCell}text-align:center">${usedTxt}</td>
          <td style="${quotaCell}text-align:center">${beforeTxt}</td>
          <td style="${quotaCell}text-align:center;font-weight:bold${isOver ? ';color:#B00020' : ''}">${afterTxt}</td>
        </tr>`;
            })
            .join('');

          // Catatan tambahan (hanya bila relevan) supaya tetap ringkas & muat 1 halaman.
          const quotaNotes: string[] = [];
          if (isVoid) {
            quotaNotes.push(`Pengajuan ${requestDetail.status}: kuota tidak terpotong.`);
          }
          if (quotaPrint.some((row) => row.missing)) {
            quotaNotes.push('Jenis cuti tanpa data kuota mengikuti ketentuan HR.');
          }
          if (quotaPrint.some((row) => row.unlimited)) {
            quotaNotes.push('Jenis cuti dengan kuota "Tidak dibatasi" tidak memotong kuota tahunan.');
          }
          const quotaNotesHtml = quotaNotes.length
            ? `<tr><td colspan="5" style="${c}padding:2px 5px;font-size:9px;font-style:italic;">${esc(
                quotaNotes.join(' ')
              )}</td></tr>`
            : '';

          return `
<style>
  .print-doc table.grid-table { border-collapse: separate !important; border-spacing: 0 !important; border-top: 1px solid #000 !important; border-left: 1px solid #000 !important; }
  .print-doc table.grid-table td, .print-doc table.grid-table th { border-right: 1px solid #000 !important; border-bottom: 1px solid #000 !important; border-top: 0 !important; border-left: 0 !important; empty-cells: show !important; box-sizing: border-box !important; }
</style>
<div class="print-doc" style="background:white;color:black;font-family:Arial,Helvetica,sans-serif;padding:8px;max-width:900px;margin:0 auto;font-size:12px;line-height:1.4">
  <h2 style="text-align:center;font-weight:bold;font-size:13px;text-transform:uppercase;text-decoration:underline;margin-bottom:14px;color:#000">PERMOHONAN CUTI/IZIN MENINGGALKAN PEKERJAAN</h2>
  <div style="font-size:11px;line-height:1.6;margin-bottom:12px">
    <p style="font-weight:bold;margin-bottom:4px">Saya yang bertanda tangan di bawah ini:</p>
    <table style="border:none!important;border-collapse:collapse;font-size:11px">
      <tr><td style="border:none!important;padding:2px 0;width:170px">NIK</td><td style="border:none!important;padding:2px 4px;width:12px">:</td><td style="border:none!important;padding:2px 0;font-weight:bold">${nip}</td></tr>
      <tr><td style="border:none!important;padding:2px 0">Nama Jelas Karyawan</td><td style="border:none!important;padding:2px 4px">:</td><td style="border:none!important;padding:2px 0;font-weight:bold">${nama}</td></tr>
      <tr><td style="border:none!important;padding:2px 0">Nama Perusahaan</td><td style="border:none!important;padding:2px 4px">:</td><td style="border:none!important;padding:2px 0;font-weight:bold;border-bottom:1px solid #000!important">PT Bukit Energi Servis Terpadu</td></tr>
      <tr><td style="border:none!important;padding:2px 0">Satuan Kerja Pengguna</td><td style="border:none!important;padding:2px 4px">:</td><td style="border:none!important;padding:2px 0;font-weight:bold;border-bottom:1px solid #000!important">${unit}</td></tr>
    </table>
  </div>
  <p style="font-size:11px;margin-top:8px;margin-bottom:10px">Dengan ini mengajukan Cuti/Izin Meninggalkan Pekerjaan dengan rincian sebagai berikut:</p>
  <div style="margin-top:4px">
    <table class="grid-table" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate!important;border-spacing:0!important;font-size:10.5px;border-top:1px solid #000!important;border-left:1px solid #000!important">
      <thead>
        <tr>
          <th colspan="2" style="${hdr}">Jenis Cuti</th>
          <th colspan="2" style="${hdr}">Tanggal Pelaksanaan</th>
        </tr>
        <tr>
          <th colspan="2" style="${sub}">(beri tanda silang (x) pada kolom berikut)</th>
          <th style="${mCell}">Mulai</th>
          <th style="${mCell}">Sampai</th>
        </tr>
      </thead>
      <tbody>
        ${cutiRowsHtml}
        <tr>
          <th colspan="2" style="${hdr}">Jenis Izin Meninggalkan</th>
          <th colspan="2" style="${hdr}">Tanggal Pelaksanaan</th>
        </tr>
        <tr>
          <th colspan="2" style="${sub}">(beri tanda silang (x) pada kolom berikut)</th>
          <th style="${mCell}">Mulai</th>
          <th style="${mCell}">Sampai</th>
        </tr>
        ${izinRowsHtml}
      </tbody>
    </table>
  </div>
  <div style="margin-top:8px;page-break-inside:avoid">
    <table class="grid-table" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate!important;border-spacing:0!important;font-size:9.5px;border-top:1px solid #000!important;border-left:1px solid #000!important">
      <thead>
        <tr>
          <th colspan="5" style="${hdr}padding:3px;">RINCIAN KUOTA CUTI</th>
        </tr>
        <tr>
          <th style="${sub}text-align:left;width:36%;">Jenis Cuti</th>
          <th style="${sub}width:13%;">Jumlah Hari</th>
          <th style="${sub}width:17%;">Kuota Terpakai (Pengajuan Ini)</th>
          <th style="${sub}width:15%;">Sisa Sebelum</th>
          <th style="${sub}width:19%;">Sisa Sesudah</th>
        </tr>
      </thead>
      <tbody>${quotaPrintHtml}${quotaNotesHtml}
      </tbody>
    </table>
  </div>
  <div style="margin-top:10px;font-size:11px;line-height:1.5">
    <p style="font-weight:bold;margin-bottom:4px">Keterangan:</p>
    <div style="min-height:38px;padding:6px 8px;border:1px solid #000;white-space:pre-wrap">${esc(requestDetail.reason)}</div>
  </div>
  <div style="margin-top:30px;display:flex;justify-content:space-between;text-align:center;font-size:11px">
    <div style="width:30%">
      <p style="font-weight:bold;height:16px">Menyetujui,</p>
      <p style="font-size:10px;line-height:1.2;margin-top:3px;height:26px">${approverPositionHtml}</p>
      <div style="height:58px"></div>
      <p style="font-weight:bold;text-decoration:underline">${approverName}</p>
      <p style="font-size:10px;margin-top:1px">NP. ${approverNip}</p>
    </div>
    <div style="width:30%">
      <p style="font-weight:bold;height:16px">Mengetahui,</p>
      <p style="font-size:10px;line-height:1.2;margin-top:3px;height:26px">${knowingPositionHtml}</p>
      <div style="height:58px"></div>
      <p style="font-weight:bold;text-decoration:underline">${knowingName}</p>
      <p style="font-size:10px;margin-top:1px">NP. ${knowingNip}</p>
    </div>
    <div style="width:30%">
      <p style="font-weight:bold;height:16px">Pemohon,</p>
      <p style="font-size:10px;line-height:1.2;margin-top:3px;height:26px">${unit}</p>
      <div style="height:58px"></div>
      <p style="font-weight:bold;text-decoration:underline">(${nama})</p>
      <p style="font-size:10px;margin-top:1px">NP. ${nip}</p>
    </div>
  </div>
</div>`;
        })() }}
      />

      {/* Status Change Modal */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title={
          targetStatus === 'DONE'
            ? '🔵 Tandai Pengajuan Selesai (DONE)'
            : targetStatus === 'APPROVED'
            ? '✅ Setujui Pengajuan Cuti'
            : targetStatus === 'REJECTED'
            ? '❌ Tolak Pengajuan Cuti'
            : '⚠️ Pembatalan Pengajuan Cuti'
        }
        description="Pembaruan status pengajuan cuti"
      >
        <div className="space-y-4 text-xs">
          <p className="font-semibold text-slate-700">
            Apakah Anda yakin ingin mengubah status pengajuan cuti ini menjadi{' '}
            <strong className="text-indigo-950 uppercase font-black">{targetStatus}</strong>?
          </p>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Catatan (Opsional)</label>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={3}
              placeholder="Masukkan catatan pendukung (contoh: Disetujui / Selesai dilaksanakan)..."
              className="w-full p-3 text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setStatusModalOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              disabled={submittingStatus}
              onClick={handleUpdateStatus}
              className={
                targetStatus === 'DONE'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white font-bold'
                  : targetStatus === 'APPROVED'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }
            >
              {submittingStatus ? 'Memproses...' : 'Proses Perubahan'}
            </Button>
          </div>
        </div>
      </Modal>
    </React.Fragment>
  );
}
