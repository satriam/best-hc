'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { CalendarRangePicker } from '@/components/ui/CalendarRangePicker';
import { formatDate } from '@/lib/utils';
import { rangesOverlap, toDateKey } from '@/schemas/leave.schema';
import {
  ArrowLeft,
  Upload,
  AlertTriangle,
  Info,
  Sparkles,
  Plus,
  Trash2,
  CalendarRange,
} from 'lucide-react';
import Link from 'next/link';

interface LeaveType {
  id: string;
  name: string;
  category: 'CUTI' | 'IZIN_MENINGGALKAN';
  defaultDays?: number | null;
  daysDescription?: string | null;
  calculationType: string;
}

interface HolidayDetail {
  date: string;
  name: string;
}

interface BookedDateDetail {
  date: string;
  leaveType: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  gender: 'MALE' | 'FEMALE';
  remainingQuota: number;
}

/** Baris ringkas GET /api/holidays */
interface HolidayApiRow {
  date: string;
  name: string;
}

/** Baris ringkas GET /api/leave-requests (untuk menandai tanggal yang sudah dipakai) */
interface LeaveRequestListRow {
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

/** Satu baris rentang tanggal pada form (satu rentang = satu jenis cuti). */
interface SegmentDraft {
  key: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
}

/** Hasil hitung per rentang dari POST /api/leave-requests/calculate (bentuk segments[]). */
interface CalcSegment {
  index: number;
  leaveTypeId: string;
  leaveTypeName: string | null;
  startDate: string;
  endDate: string;
  totalDays: number;
  holidaysInRange: HolidayDetail[];
  weekendDaysCount: number;
}

interface CalcResult {
  totalDays: number;
  segments: CalcSegment[];
  holidaysInRange: HolidayDetail[];
  weekendDaysCount: number;
}

const EMPTY_CALC: CalcResult = {
  totalDays: 0,
  segments: [],
  holidaysInRange: [],
  weekendDaysCount: 0,
};

const formSchema = z.object({
  reason: z.string().min(3, 'Keterangan minimal 3 karakter'),
  attachmentUrl: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

let segmentKeySeq = 0;
function nextSegmentKey() {
  segmentKeySeq += 1;
  return `seg-${segmentKeySeq}`;
}

/** Tanggal hari ini menurut zona waktu lokal (bukan UTC), format YYYY-MM-DD. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/** Geser kunci tanggal 'YYYY-MM-DD' sebanyak n hari (tanpa pergeseran timezone). */
function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  if (isNaN(d.getTime())) return dateKey;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function safeParseJson(res: Response) {
  return res.text().then((text) => {
    try {
      return text && text.trim().length > 0 ? JSON.parse(text) : {};
    } catch {
      return { success: false, message: 'Respon tidak valid' };
    }
  });
}

/** Format rentang untuk pesan validasi: 01/10/2026 - 03/10/2026 */
function formatRange(segment: { startDate: string; endDate: string }): string {
  return `${formatDate(segment.startDate)} - ${formatDate(segment.endDate)}`;
}

export default function CreateLeaveRequestPage() {
  const router = useRouter();

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loadingLeaveTypes, setLoadingLeaveTypes] = useState(true);
  const [userGender, setUserGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [showMaleWarningModal, setShowMaleWarningModal] = useState(false);
  const [maleWarningTypeName, setMaleWarningTypeName] = useState<string>('');
  const [allHolidays, setAllHolidays] = useState<HolidayDetail[]>([]);
  const [userBookedDates, setUserBookedDates] = useState<BookedDateDetail[]>([]);

  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [typeQuotas, setTypeQuotas] = useState<
    Record<string, { totalQuota: number; usedQuota: number }>
  >({});

  // Daftar rentang tanggal — inti form ini
  const [segments, setSegments] = useState<SegmentDraft[]>([
    { key: nextSegmentKey(), leaveTypeId: '', startDate: todayKey(), endDate: todayKey() },
  ]);
  const [calc, setCalc] = useState<CalcResult>(EMPTY_CALC);
  const [calculating, setCalculating] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reason: '',
      attachmentUrl: '',
    },
  });

  // Fetch Leave Types, User Quota, User Gender, All Holidays (and user list for ADMIN)
  useEffect(() => {
    async function fetchData() {
      try {
        const [resTypes, resMe, resHolidays] = await Promise.all([
          fetch('/api/leave-types'),
          fetch('/api/auth/me'),
          fetch('/api/holidays'),
        ]);

        const jsonTypes = await safeParseJson(resTypes);
        const jsonMe = await safeParseJson(resMe);
        const jsonHolidays = await safeParseJson(resHolidays);

        const admin = !!(jsonMe.success && jsonMe.data && jsonMe.data.role === 'ADMIN');
        setIsAdmin(admin);

        if (jsonMe.success && jsonMe.data) {
          setCurrentUserId(jsonMe.data.id);
          if (jsonMe.data.gender) {
            setUserGender(jsonMe.data.gender);
          }
        }

        if (admin) {
          const jsonUsers = await safeParseJson(await fetch('/api/users'));
          if (jsonUsers.success && Array.isArray(jsonUsers.data)) {
            setUsers(jsonUsers.data);
          }
        }

        if (jsonTypes.success && Array.isArray(jsonTypes.data) && jsonTypes.data.length > 0) {
          setLeaveTypes(jsonTypes.data);

          // Jenis cuti default untuk baris pertama: Cuti Tahunan bila ada.
          const defaultType =
            jsonTypes.data.find((t: LeaveType) => t.name === 'Cuti Tahunan') || jsonTypes.data[0];
          if (defaultType) {
            setSegments((prev) =>
              prev.map((segment, index) =>
                index === 0 && !segment.leaveTypeId
                  ? { ...segment, leaveTypeId: defaultType.id }
                  : segment
              )
            );
          }
        }

        if (jsonHolidays.success && Array.isArray(jsonHolidays.data)) {
          setAllHolidays(
            jsonHolidays.data.map((h: HolidayApiRow) => ({
              date: h.date.split('T')[0],
              name: h.name,
            }))
          );
        }
      } catch (err) {
        console.error('Gagal mengambil data:', err);
      } finally {
        setLoadingLeaveTypes(false);
      }
    }
    fetchData();
  }, []);

  // Fetch existing leave requests to mark booked dates.
  // ADMIN sees the selected user's requests; regular users see their own.
  useEffect(() => {
    async function fetchBookedDates() {
      if (isAdmin && !selectedUserId) {
        setUserBookedDates([]);
        return;
      }

      try {
        const query = isAdmin ? `?userId=${selectedUserId}` : '';
        const json = await safeParseJson(await fetch(`/api/leave-requests${query}`));
        if (!json.success || !Array.isArray(json.data)) return;

        const bookedList: BookedDateDetail[] = [];
        json.data.forEach((req: LeaveRequestListRow) => {
          if (req.status === 'ON_PROGRESS' || req.status === 'APPROVED' || req.status === 'DONE') {
            // Tandai tanggal per rentang (segments) supaya celah antar rentang tidak ikut ditandai.
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
                bookedList.push({
                  date: `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(
                    2,
                    '0'
                  )}-${String(curr.getDate()).padStart(2, '0')}`,
                  leaveType: range.leaveTypeName,
                });
                curr.setDate(curr.getDate() + 1);
              }
            });
          }
        });
        setUserBookedDates(bookedList);
      } catch (err) {
        console.error('Gagal mengambil tanggal cuti:', err);
      }
    }
    fetchBookedDates();
  }, [isAdmin, selectedUserId]);

  // Gender yang dipakai untuk peringatan cuti khusus: mengikuti karyawan terpilih bila ADMIN.
  const effectiveGender: 'MALE' | 'FEMALE' =
    isAdmin ? users.find((u) => u.id === selectedUserId)?.gender ?? userGender : userGender;

  // Tahun kuota mengikuti tanggal mulai paling awal dari rentang yang diisi.
  const quotaYear = useMemo(() => {
    const years = segments
      .map((s) => (s.startDate ? Number(s.startDate.slice(0, 4)) : NaN))
      .filter((y) => !isNaN(y) && y > 2000);
    return years.length > 0 ? Math.min(...years) : new Date().getFullYear();
  }, [segments]);

  // Fetch per-leave-type quota for the relevant user so the form shows real remaining days
  useEffect(() => {
    async function fetchTypeQuotas() {
      const targetId = isAdmin ? selectedUserId : currentUserId;
      if (!targetId) {
        setTypeQuotas({});
        return;
      }

      try {
        const json = await safeParseJson(
          await fetch(`/api/quotas/${targetId}?year=${quotaYear}`)
        );
        if (!json.success || !Array.isArray(json.data)) return;

        const map: Record<string, { totalQuota: number; usedQuota: number }> = {};
        json.data.forEach(
          (q: { leaveTypeId: string; totalQuota: number; usedQuota: number }) => {
            map[q.leaveTypeId] = { totalQuota: q.totalQuota, usedQuota: q.usedQuota };
          }
        );
        setTypeQuotas(map);
      } catch (err) {
        console.error('Gagal mengambil kuota per jenis cuti:', err);
      }
    }
    fetchTypeQuotas();
  }, [isAdmin, selectedUserId, currentUserId, quotaYear]);

  // Hitung hari kerja per rentang lewat API (debounce supaya tidak menembak tiap ketukan)
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      const hasUsableSegment = segments.some((s) => s.startDate && s.endDate);
      if (!hasUsableSegment) {
        setCalc(EMPTY_CALC);
        return;
      }

      setCalculating(true);
      try {
        const res = await fetch('/api/leave-requests/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            segments: segments.map((s) => ({
              leaveTypeId: s.leaveTypeId,
              startDate: s.startDate,
              endDate: s.endDate,
            })),
          }),
        });

        const json = await safeParseJson(res);
        if (!cancelled && json.success) {
          setCalc({
            totalDays: json.totalDays ?? 0,
            segments: Array.isArray(json.segments) ? json.segments : [],
            holidaysInRange: Array.isArray(json.holidaysInRange) ? json.holidaysInRange : [],
            weekendDaysCount: json.weekendDaysCount ?? 0,
          });
        }
      } catch (err) {
        console.error('Error calculation:', err);
      } finally {
        if (!cancelled) setCalculating(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [segments]);

  const segCalc = (index: number): CalcSegment | undefined =>
    calc.segments.find((s) => s.index === index);

  // ---- Validasi UI per baris (jenis cuti, urutan tanggal, tumpang tindih antar baris) ----
  const rowErrors = useMemo(() => {
    const result: string[][] = segments.map(() => []);

    segments.forEach((segment, index) => {
      if (!segment.leaveTypeId) {
        result[index].push('Jenis cuti wajib dipilih.');
      }
      if (!segment.startDate || !segment.endDate) {
        result[index].push('Tanggal mulai dan tanggal selesai wajib diisi.');
        return;
      }
      if (toDateKey(segment.endDate) < toDateKey(segment.startDate)) {
        result[index].push('Tanggal selesai tidak boleh sebelum tanggal mulai.');
      }
    });

    // Antar rentang tidak boleh tumpang tindih (hari kalender).
    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        const a = segments[i];
        const b = segments[j];
        if (!a.startDate || !a.endDate || !b.startDate || !b.endDate) continue;
        if (toDateKey(a.startDate) > toDateKey(a.endDate)) continue;
        if (toDateKey(b.startDate) > toDateKey(b.endDate)) continue;
        if (rangesOverlap(a, b)) {
          result[i].push(`Tanggal bentrok dengan rentang ke-${j + 1} (${formatRange(b)}).`);
          result[j].push(`Tanggal bentrok dengan rentang ke-${i + 1} (${formatRange(a)}).`);
        }
      }
    }

    return result;
  }, [segments]);

  const hasRowErrors = rowErrors.some((list) => list.length > 0);

  // ---- Rincian kuota PER JENIS CUTI (agregasi hari semua rentang dengan jenis yang sama) ----
  const quotaRows = useMemo(() => {
    const daysByType = new Map<string, number>();

    segments.forEach((segment, index) => {
      if (!segment.leaveTypeId) return;
      const days = calc.segments.find((s) => s.index === index)?.totalDays ?? 0;
      daysByType.set(segment.leaveTypeId, (daysByType.get(segment.leaveTypeId) ?? 0) + days);
    });

    return Array.from(daysByType.entries()).map(([typeId, days]) => {
      const type = leaveTypes.find((t) => t.id === typeId);
      const quota = typeQuotas[typeId];
      const isUnlimited = !!quota && quota.totalQuota >= 999;
      const remainingBefore = quota ? quota.totalQuota - quota.usedQuota : null;
      const remainingAfter = remainingBefore !== null ? remainingBefore - days : null;

      return {
        typeId,
        name: type?.name ?? 'Jenis cuti',
        daysDescription: type?.daysDescription ?? null,
        days,
        totalQuota: quota ? quota.totalQuota : null,
        usedQuota: quota ? quota.usedQuota : null,
        remainingBefore,
        remainingAfter,
        isUnlimited,
        hasQuota: !!quota,
        isOver: remainingAfter !== null && !isUnlimited && remainingAfter < 0,
      };
    });
  }, [segments, calc, typeQuotas, leaveTypes]);

  const quotaOverRows = quotaRows.filter((row) => row.isOver);

  // Rentang yang dipakai untuk menandai kalender (gabungan semua rentang valid).
  const calendarRanges = segments
    .filter((s) => s.startDate && s.endDate && toDateKey(s.endDate) >= toDateKey(s.startDate))
    .map((s) => ({ startDate: s.startDate, endDate: s.endDate }));

  const femaleOnlyTypes = [
    'Cuti Bersalin',
    'Cuti Bersalin dengan Keadaan Khusus',
    'Cuti Gugur Kandungan',
  ];

  const updateSegment = (key: string, patch: Partial<SegmentDraft>) => {
    setSegments((prev) =>
      prev.map((segment) => (segment.key === key ? { ...segment, ...patch } : segment))
    );
  };

  const handleSelectLeaveType = (key: string, typeId: string) => {
    const selectedType = leaveTypes.find((t) => t.id === typeId);

    if (
      effectiveGender === 'MALE' &&
      selectedType &&
      femaleOnlyTypes.some((name) => selectedType.name.toLowerCase().includes(name.toLowerCase()))
    ) {
      setMaleWarningTypeName(selectedType.name);
      setShowMaleWarningModal(true);
      return;
    }

    updateSegment(key, { leaveTypeId: typeId });
  };

  const handleAddSegment = () => {
    const last = segments[segments.length - 1];
    const start = last?.endDate ? shiftDateKey(last.endDate, 1) : todayKey();
    setSegments((prev) => [
      ...prev,
      {
        key: nextSegmentKey(),
        leaveTypeId: last?.leaveTypeId || '',
        startDate: start,
        endDate: start,
      },
    ]);
  };

  const handleRemoveSegment = (key: string) => {
    setSegments((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.key !== key)));
  };

  const onSubmit = async (data: FormValues) => {
    setErrorMsg(null);

    if (isAdmin && !selectedUserId) {
      setErrorMsg('Silakan pilih karyawan yang akan diajukan cuti terlebih dahulu.');
      return;
    }

    if (hasRowErrors) {
      const firstError = rowErrors.flat()[0];
      setErrorMsg(`Periksa kembali daftar rentang tanggal. ${firstError}`);
      return;
    }

    if (calc.totalDays <= 0) {
      setErrorMsg(
        'Total hari kerja efektif dari seluruh rentang adalah 0 (contoh: hanya tanggal merah / akhir pekan). Silakan pilih hari kerja.'
      );
      return;
    }

    if (quotaOverRows.length > 0) {
      const row = quotaOverRows[0];
      setErrorMsg(
        `Sisa kuota ${row.name} tidak mencukupi (Sisa: ${row.remainingBefore} Hari, Pengajuan: ${row.days} Hari).`
      );
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        segments: segments.map((segment) => ({
          leaveTypeId: segment.leaveTypeId,
          startDate: segment.startDate,
          endDate: segment.endDate,
        })),
        reason: data.reason,
        attachmentUrl: data.attachmentUrl?.trim() ? data.attachmentUrl.trim() : null,
        ...(isAdmin ? { userId: selectedUserId } : {}),
      };

      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await safeParseJson(res);
      if (!res.ok || !json.success) {
        // Tampilkan pesan asli dari API (overlap / kuota / validasi), bukan pesan generik.
        throw new Error(json.message || 'Gagal membuat pengajuan cuti');
      }

      const createdId = json.data?.id;
      if (createdId) {
        router.push(
          isAdmin ? `/admin/leave-requests/${createdId}` : `/leave-requests/${createdId}`
        );
      } else {
        router.push(isAdmin ? '/admin/leave-requests' : '/dashboard');
      }
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat pengajuan cuti');
    } finally {
      setSubmitting(false);
    }
  };

  const cutiTypes = leaveTypes.filter((t) => t.category === 'CUTI');
  const izinTypes = leaveTypes.filter((t) => t.category === 'IZIN_MENINGGALKAN');

  // Angka pada kartu jenis cuti = SISA SEBELUM pengajuan, selalu dari kuota per-jenis cuti.
  const getQuotaDisplay = (type: LeaveType) => {
    const quota = typeQuotas[type.id];
    if (quota) {
      if (quota.totalQuota >= 999) return 'Tidak dibatasi';
      return `${Math.max(0, quota.totalQuota - quota.usedQuota)} Hari`;
    }

    return type.daysDescription || (type.defaultDays ? `${type.defaultDays} Hari` : 'Sesuai Ketentuan');
  };

  const submitDisabled =
    submitting ||
    hasRowErrors ||
    quotaOverRows.length > 0 ||
    calc.totalDays <= 0 ||
    (isAdmin && !selectedUserId);

  return (
    <div className="w-full space-y-6">
      {/* Top Action & Title */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={isAdmin ? '/admin/leave-requests' : '/dashboard'}>
            <Button variant="outline" size="sm" className="rounded-lg">
              <ArrowLeft className="w-4 h-4" /> Kembali
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Form Pengajuan Cuti</h1>
            <p className="text-xs text-slate-500">
              Satu pengajuan boleh berisi beberapa rentang tanggal, masing-masing dengan jenis cutinya sendiri.
            </p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-800 text-xs font-medium w-full animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-900">Pengajuan Cuti Tidak Dapat Diproses</p>
            <p className="mt-0.5 font-semibold text-rose-800">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Main Full Width Form Card */}
      <Card className="w-full p-6 md:p-8 border border-slate-200 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 w-full">
          {/* Section 0: Pilih Karyawan (ADMIN only) */}
          {isAdmin && (
            <div className="w-full p-5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
              <label className="block text-sm font-bold text-slate-900">
                0. Pilih Karyawan <span className="text-rose-500">*</span>
              </label>
              <p className="text-xs text-slate-500">
                Anda login sebagai Admin. Pengajuan cuti ini akan dibuat atas nama karyawan yang dipilih.
              </p>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full h-11 px-3.5 text-sm rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">-- Pilih Karyawan --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Section 1: Daftar Rentang Tanggal */}
          <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-bold text-slate-900">
                1. Daftar Rentang Tanggal <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs text-slate-500">
                Tiap rentang boleh berbeda jenis cuti. Tanggal boleh melompat hari.
              </span>
            </div>

            {loadingLeaveTypes ? (
              <div className="py-8 text-center text-xs text-slate-400">Memuat jenis cuti...</div>
            ) : (
              <div className="space-y-3 w-full">
                {segments.map((segment, index) => {
                  const errorsForRow = rowErrors[index] ?? [];
                  const segmentCalc = segCalc(index);
                  const days = segmentCalc?.totalDays ?? 0;
                  const holidaysCount = segmentCalc?.holidaysInRange?.length ?? 0;
                  const weekendCount = segmentCalc?.weekendDaysCount ?? 0;
                  const hasError = errorsForRow.length > 0;
                  const selectedType = leaveTypes.find((t) => t.id === segment.leaveTypeId);

                  return (
                    <div
                      key={segment.key}
                      data-testid={`segment-row-${index}`}
                      className={`rounded-2xl border p-4 space-y-3 w-full animate-fadeIn ${
                        hasError ? 'bg-rose-50/70 border-rose-300' : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                          <CalendarRange className="w-4 h-4 text-indigo-600" /> Rentang {index + 1}
                          {selectedType && (
                            <span className="text-[11px] font-bold text-indigo-800 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-md">
                              {selectedType.name}
                            </span>
                          )}
                        </span>

                        <div className="flex items-center gap-2">
                          <span
                            data-testid={`segment-days-${index}`}
                            className={`text-[11px] font-extrabold px-2.5 py-1 rounded-md border ${
                              days > 0
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}
                          >
                            {days} hari kerja
                          </span>
                          {(weekendCount > 0 || holidaysCount > 0) && (
                            <span className="hidden sm:inline text-[11px] font-semibold text-slate-500">
                              {holidaysCount > 0 && `${holidaysCount} libur nasional`}
                              {holidaysCount > 0 && weekendCount > 0 && ' · '}
                              {weekendCount > 0 && `${weekendCount} akhir pekan`}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveSegment(segment.key)}
                            disabled={segments.length <= 1}
                            title={
                              segments.length <= 1
                                ? 'Minimal satu rentang tanggal'
                                : 'Hapus rentang ini'
                            }
                            aria-label={`Hapus rentang ${index + 1}`}
                            className="p-2 rounded-lg border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Jenis Cuti
                          </label>
                          <select
                            data-testid={`segment-type-${index}`}
                            value={segment.leaveTypeId}
                            onChange={(e) => handleSelectLeaveType(segment.key, e.target.value)}
                            className="w-full h-11 px-3 text-sm rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">-- Pilih Jenis Cuti --</option>
                            {cutiTypes.length > 0 && (
                              <optgroup label="Cuti">
                                {cutiTypes.map((type) => (
                                  <option key={type.id} value={type.id}>
                                    {type.name} ({getQuotaDisplay(type)})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {izinTypes.length > 0 && (
                              <optgroup label="Izin Meninggalkan">
                                {izinTypes.map((type) => (
                                  <option key={type.id} value={type.id}>
                                    {type.name} ({getQuotaDisplay(type)})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Tanggal Mulai
                          </label>
                          <input
                            type="date"
                            data-testid={`segment-start-${index}`}
                            value={segment.startDate}
                            onChange={(e) =>
                              updateSegment(segment.key, {
                                startDate: e.target.value,
                                endDate:
                                  segment.endDate && e.target.value > segment.endDate
                                    ? e.target.value
                                    : segment.endDate,
                              })
                            }
                            className="w-full h-11 px-3 text-sm rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Tanggal Selesai
                          </label>
                          <input
                            type="date"
                            data-testid={`segment-end-${index}`}
                            value={segment.endDate}
                            min={segment.startDate || undefined}
                            onChange={(e) => updateSegment(segment.key, { endDate: e.target.value })}
                            className="w-full h-11 px-3 text-sm rounded-lg border border-slate-300 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {hasError && (
                        <ul className="space-y-1">
                          {errorsForRow.map((message, i) => (
                            <li
                              key={`${segment.key}-err-${i}`}
                              className="text-[11px] font-bold text-rose-700 flex items-start gap-1.5"
                            >
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {message}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <Button type="button" variant="outline" size="sm" onClick={handleAddSegment}>
                    <Plus className="w-4 h-4" /> Tambah Rentang Tanggal
                  </Button>
                  <span className="text-[11px] font-semibold text-slate-500">
                    {segments.length} rentang · total {calc.totalDays} hari kerja
                    {calculating ? ' (menghitung...)' : ''}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Kalender (pratinjau gabungan semua rentang) */}
          <div className="w-full space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-bold text-slate-900">
                2. Kalender Rentang Cuti
              </label>
              <span className="text-xs font-extrabold text-indigo-900 bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200">
                {calendarRanges.length} rentang dipilih · {calc.totalDays} hari kerja
              </span>
            </div>

            <CalendarRangePicker
              ranges={calendarRanges}
              holidays={allHolidays}
              bookedDates={userBookedDates}
            />

            {/* High-Contrast Calculated Duration Banner */}
            <div className="p-5 rounded-2xl bg-indigo-600 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md border-2 border-indigo-700">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center font-black text-white shrink-0">
                  <Sparkles className="w-6 h-6 text-amber-300" />
                </div>
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-100">
                    Total Durasi Cuti Terhitung
                  </h4>
                  <p className="text-xs text-indigo-100 font-medium">
                    Akumulasi hari kerja efektif dari {segments.length} rentang tanggal
                  </p>
                </div>
              </div>

              <div className="flex items-baseline gap-2 bg-white text-indigo-950 px-6 py-2.5 rounded-xl font-black shadow-sm">
                <span
                  data-testid="total-days"
                  className="text-3xl font-black text-indigo-600"
                >
                  {calc.totalDays}
                </span>
                <span className="text-base font-extrabold text-slate-800">Hari Kerja</span>
              </div>
            </div>

            {/* Rincian per rentang */}
            {calc.segments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
                {calc.segments.map((segmentCalc) => (
                  <div
                    key={`calc-${segmentCalc.index}`}
                    className="p-3 rounded-xl bg-white border border-slate-200 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-900">
                        Rentang {segmentCalc.index + 1}
                      </span>
                      <span className="font-black text-indigo-700">
                        {segmentCalc.totalDays} hari
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                      {segmentCalc.leaveTypeName || 'Jenis cuti belum dipilih'}
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {formatRange(segmentCalc)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Rincian Tanggal Merah & Libur Terdeteksi */}
            {(calc.holidaysInRange.length > 0 || calc.weekendDaysCount > 0) && (
              <div className="p-4 rounded-xl bg-indigo-50/80 border border-indigo-200 space-y-3 w-full animate-fadeIn">
                <div className="flex items-center justify-between border-b border-indigo-200/80 pb-2">
                  <span className="text-xs font-extrabold text-indigo-950 flex items-center gap-2">
                    <Info className="w-4 h-4 text-indigo-600" /> Rincian Hari Libur Terdeteksi pada Kalender:
                  </span>
                  <span className="text-xs font-bold text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-full border border-indigo-200">
                    Bukan Hari Kerja (Tidak Memotong Kuota)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {calc.holidaysInRange.map((h) => (
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
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-rose-600 text-white shadow-2xs">
                        🔴 Libur Nasional
                      </span>
                    </div>
                  ))}

                  {calc.weekendDaysCount > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="w-3 h-3 rounded-full bg-amber-600 shrink-0" />
                        <div>
                          <span className="font-extrabold text-amber-950 text-sm">Akhir Pekan (Sabtu & Minggu)</span>
                          <p className="text-xs font-bold text-amber-800">
                            Terdeteksi {calc.weekendDaysCount} hari akhir pekan
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-amber-600 text-white shadow-2xs">
                        Libur Weekend
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Rincian Kuota per Jenis Cuti yang dipakai */}
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900">3. Rincian Kuota Cuti per Jenis</label>
              <span className="text-xs text-slate-400">
                Otomatis mengikuti jenis cuti &amp; rentang tanggal
              </span>
            </div>

            {quotaRows.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 font-medium">
                Pilih jenis cuti pada daftar rentang untuk melihat rincian kuota (dipakai, sisa sebelum, dan sisa sesudah pengajuan).
              </div>
            ) : (
              <div className="space-y-3 w-full">
                {quotaRows.map((row) => (
                  <div
                    key={row.typeId}
                    data-testid={`quota-row-${row.typeId}`}
                    className={`rounded-2xl border p-4 w-full animate-fadeIn ${
                      row.isOver ? 'bg-rose-50/80 border-rose-300' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <span className="text-sm font-extrabold text-slate-900">{row.name}</span>
                      <span className="text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                        Pengajuan ini: {row.days} hari
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Kuota dipakai */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Kuota dipakai
                        </span>
                        <span className="block mt-1 text-base font-black text-slate-800">
                          {row.isUnlimited
                            ? 'Tidak dibatasi'
                            : row.hasQuota
                            ? `${row.usedQuota} Hari`
                            : '-'}
                        </span>
                      </div>

                      {/* Sisa sebelum pengajuan ini */}
                      <div className="p-3 rounded-xl bg-indigo-50/80 border border-indigo-200">
                        <span className="block text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                          Sisa sebelum
                        </span>
                        <span className="block mt-1 text-base font-black text-indigo-900">
                          {row.isUnlimited
                            ? 'Tidak dibatasi'
                            : row.hasQuota
                            ? `${row.remainingBefore} Hari`
                            : 'Belum ada data'}
                        </span>
                        {!row.isUnlimited && row.hasQuota && (
                          <span className="block text-[11px] text-slate-500 font-semibold mt-0.5">
                            dari {row.totalQuota} hari
                          </span>
                        )}
                      </div>

                      {/* Sisa sesudah pengajuan ini */}
                      <div
                        className={`p-3 rounded-xl border ${
                          row.isOver
                            ? 'bg-rose-100 border-rose-300'
                            : 'bg-emerald-50/80 border-emerald-200'
                        }`}
                      >
                        <span
                          className={`block text-[11px] font-bold uppercase tracking-wider ${
                            row.isOver ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          Sisa sesudah
                        </span>
                        <span
                          className={`block mt-1 text-base font-black ${
                            row.isOver ? 'text-rose-700' : 'text-emerald-900'
                          }`}
                        >
                          {row.isUnlimited
                            ? 'Tidak dibatasi'
                            : row.hasQuota
                            ? `${row.remainingAfter} Hari`
                            : '-'}
                        </span>
                        {row.isOver && (
                          <span className="block text-[11px] text-rose-700 font-extrabold mt-0.5">
                            ⚠ Kuota tidak cukup
                          </span>
                        )}
                      </div>
                    </div>

                    {!row.hasQuota && (
                      <p className="mt-2 text-[11px] text-amber-800 font-semibold bg-amber-50 border border-amber-200 rounded-lg p-2">
                        Data kuota jenis cuti ini belum tersedia. Jatah mengikuti ketentuan:{' '}
                        {row.daysDescription || 'sesuai kebijakan HR'}.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Reason & Attachment */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Keterangan / Alasan <span className="text-rose-500">*</span>
              </label>
              <textarea
                {...register('reason')}
                rows={4}
                placeholder="Jelaskan keperluan pengajuan cuti Anda secara singkat dan jelas..."
                className="w-full p-3.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
              {errors.reason && <p className="mt-1 text-xs text-rose-600">{errors.reason.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Lampiran Dokumen / Surat Keterangan (Opsional)
              </label>
              <div className="relative mb-3">
                <Upload className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  {...register('attachmentUrl')}
                  placeholder="Link/URL dokumen lampiran (contoh: surat dokter, dsb)"
                  className="w-full h-11 pl-10 pr-3.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
                💡 <strong>Petunjuk:</strong> Untuk cuti sakit/bersalin/khusus, disarankan melampirkan link dokumen pendukung untuk mempermudah verifikasi oleh tim HR.
              </p>
            </div>
          </div>

          {/* Peringatan kuota (memblokir submit) */}
          {quotaOverRows.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 flex items-start gap-3 text-rose-800 text-xs font-medium w-full">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-black text-rose-900">Kuota tidak cukup</p>
                <ul className="mt-1 space-y-0.5 font-semibold">
                  {quotaOverRows.map((row) => (
                    <li key={row.typeId}>
                      {row.name}: pengajuan {row.days} hari, sisa {row.remainingBefore} hari →{' '}
                      {row.remainingAfter} hari.
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-3 w-full">
            {hasRowErrors && (
              <span className="text-[11px] font-bold text-rose-700 sm:mr-auto">
                Perbaiki rentang tanggal yang ditandai merah sebelum mengajukan.
              </span>
            )}
            <Link href={isAdmin ? '/admin/leave-requests' : '/dashboard'}>
              <Button type="button" variant="outline" size="lg">
                Batal
              </Button>
            </Link>
            <Button type="submit" disabled={submitDisabled} size="lg">
              {submitting ? 'Mengirim Pengajuan...' : 'Ajukan Cuti'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Male Warning Dialog Modal */}
      <Modal
        isOpen={showMaleWarningModal}
        onClose={() => setShowMaleWarningModal(false)}
        title="⚠️ Peringatan Hak Cuti Khusus"
        description="Pemeriksaan Jenis Kelamin Karyawan"
      >
        <div className="py-4 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-100 border-2 border-rose-300 text-rose-600 flex items-center justify-center mx-auto shadow-sm animate-bounce">
            <AlertTriangle className="w-9 h-9 stroke-[2.5]" />
          </div>

          <div className="space-y-1">
            <h3 className="text-xl font-black text-rose-950 tracking-tight">Kau lanang cok</h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto font-semibold pt-1">
              Jenis cuti ini ({maleWarningTypeName || 'Cuti Bersalin / Cuti Gugur Kandungan'}) hanya
              diperuntukkan bagi karyawan berkategori perempuan.
            </p>
          </div>

          <div className="pt-3 flex justify-center">
            <Button
              type="button"
              onClick={() => setShowMaleWarningModal(false)}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-md"
            >
              Paham, Saya Laki-laki
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
