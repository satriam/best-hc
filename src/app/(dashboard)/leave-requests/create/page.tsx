'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createLeaveRequestSchema, CreateLeaveRequestInput } from '@/schemas/leave.schema';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { CalendarRangePicker } from '@/components/ui/CalendarRangePicker';
import { formatDate } from '@/lib/utils';
import { Calendar as CalendarIcon, Upload, ArrowLeft, AlertTriangle, Check, Info, Sparkles } from 'lucide-react';
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

export default function CreateLeaveRequestPage() {
  const router = useRouter();

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loadingLeaveTypes, setLoadingLeaveTypes] = useState(true);
  const [userGender, setUserGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [showMaleWarningModal, setShowMaleWarningModal] = useState(false);
  const [allHolidays, setAllHolidays] = useState<HolidayDetail[]>([]);
  const [userBookedDates, setUserBookedDates] = useState<BookedDateDetail[]>([]);

  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [typeQuotas, setTypeQuotas] = useState<
    Record<string, { totalQuota: number; usedQuota: number }>
  >({});

  const [calculatedDays, setCalculatedDays] = useState<number>(0);
  const [holidaysInRange, setHolidaysInRange] = useState<HolidayDetail[]>([]);
  const [weekendDaysCount, setWeekendDaysCount] = useState<number>(0);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateLeaveRequestInput>({
    resolver: zodResolver(createLeaveRequestSchema),
    defaultValues: {
      leaveTypeIds: [],
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      reason: '',
      attachmentUrl: '',
    },
  });

  const selectedTypeIds = watch('leaveTypeIds') || [];
  const startDate = watch('startDate');
  const endDate = watch('endDate');

  const safeParseJson = async (res: Response) => {
    const text = await res.text();
    try {
      return text && text.trim().length > 0 ? JSON.parse(text) : {};
    } catch {
      return { success: false, message: 'Respon tidak valid' };
    }
  };

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

          // Auto select Cuti Tahunan or first leave type if nothing selected yet
          const defaultType =
            jsonTypes.data.find((t: LeaveType) => t.name === 'Cuti Tahunan') || jsonTypes.data[0];
          if (defaultType) {
            setValue('leaveTypeIds', [defaultType.id], { shouldValidate: true });
          }
        }

        if (jsonHolidays.success && Array.isArray(jsonHolidays.data)) {
          setAllHolidays(
            jsonHolidays.data.map((h: any) => ({
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
        json.data.forEach((req: any) => {
          if (req.status === 'ON_PROGRESS' || req.status === 'APPROVED' || req.status === 'DONE') {
            const s = new Date(req.startDate);
            const e = new Date(req.endDate);
            const typeName = req.requestTypes?.[0]?.leaveType?.name || 'Cuti';

            let curr = new Date(s);
            while (curr <= e) {
              const year = curr.getFullYear();
              const month = String(curr.getMonth() + 1).padStart(2, '0');
              const day = String(curr.getDate()).padStart(2, '0');
              bookedList.push({
                date: `${year}-${month}-${day}`,
                leaveType: typeName,
              });
              curr.setDate(curr.getDate() + 1);
            }
          }
        });
        setUserBookedDates(bookedList);
      } catch (err) {
        console.error('Gagal mengambil tanggal cuti:', err);
      }
    }
    fetchBookedDates();
  }, [isAdmin, selectedUserId]);

  // Sync gender display to the selected user (ADMIN only)
  useEffect(() => {
    if (!isAdmin) return;
    const selected = users.find((u) => u.id === selectedUserId);
    if (selected) setUserGender(selected.gender);
  }, [isAdmin, selectedUserId, users]);

  // Fetch per-leave-type quota for the relevant user so the form shows real remaining days
  useEffect(() => {
    async function fetchTypeQuotas() {
      const targetId = isAdmin ? selectedUserId : currentUserId;
      if (!targetId) {
        setTypeQuotas({});
        return;
      }

      try {
        const json = await safeParseJson(await fetch(`/api/quotas/${targetId}`));
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
  }, [isAdmin, selectedUserId, currentUserId]);

  // Calculate days & detect holidays dynamically
  useEffect(() => {
    async function calculateDays() {
      if (!selectedTypeIds.length || !startDate || !endDate) {
        setCalculatedDays(0);
        setHolidaysInRange([]);
        setWeekendDaysCount(0);
        return;
      }

      try {
        const res = await fetch('/api/leave-requests/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            leaveTypeIds: selectedTypeIds,
            startDate,
            endDate,
          }),
        });

        const json = await safeParseJson(res);
        if (json.success) {
          setCalculatedDays(json.totalDays ?? 0);
          setHolidaysInRange(json.holidaysInRange ?? []);
          setWeekendDaysCount(json.weekendDaysCount ?? 0);
        }
      } catch (err) {
        console.error('Error calculation:', err);
      }
    }

    calculateDays();
  }, [selectedTypeIds, startDate, endDate]);

  const handleSelectLeaveType = (typeId: string) => {
    const selectedType = leaveTypes.find((t) => t.id === typeId);

    // Female specific leave types list
    const femaleOnlyTypes = [
      'Cuti Bersalin',
      'Cuti Bersalin dengan Keadaan Khusus',
      'Cuti Gugur Kandungan',
    ];

    if (
      userGender === 'MALE' &&
      selectedType &&
      femaleOnlyTypes.some((name) => selectedType.name.toLowerCase().includes(name.toLowerCase()))
    ) {
      setShowMaleWarningModal(true);
      return;
    }

    // Single selection rule: selecting a type deselects any previously selected type
    const newSelection = selectedTypeIds.includes(typeId) ? [] : [typeId];
    setValue('leaveTypeIds', newSelection, { shouldValidate: true });
  };

  // Rincian kuota per jenis cuti terpilih (dipakai / sisa sebelum / sisa sesudah).
  // Semua jenis cuti memakai kuota per-jenis (tabel UserLeaveQuota via GET /api/quotas/<userId>),
  // tidak ada lagi angka generik dari LeaveQuota.
  const quotaRows = selectedTypeIds.map((typeId) => {
    const type = leaveTypes.find((t) => t.id === typeId);
    const quota = typeQuotas[typeId];
    const isUnlimited = !!quota && quota.totalQuota >= 999;
    const remainingBefore = quota ? quota.totalQuota - quota.usedQuota : null;
    const remainingAfter = remainingBefore !== null ? remainingBefore - calculatedDays : null;

    return {
      typeId,
      name: type?.name ?? 'Jenis cuti',
      daysDescription: type?.daysDescription ?? null,
      totalQuota: quota ? quota.totalQuota : null,
      usedQuota: quota ? quota.usedQuota : null,
      remainingBefore,
      remainingAfter,
      isUnlimited,
      hasQuota: !!quota,
      isOver: remainingAfter !== null && !isUnlimited && remainingAfter < 0,
    };
  });

  const onSubmit = async (data: CreateLeaveRequestInput) => {
    setErrorMsg(null);

    if (isAdmin && !selectedUserId) {
      setErrorMsg('Silakan pilih karyawan yang akan diajukan cuti terlebih dahulu.');
      return;
    }

    if (!selectedTypeIds || selectedTypeIds.length === 0) {
      setErrorMsg('Silakan pilih salah satu jenis cuti terlebih dahulu.');
      return;
    }

    if (calculatedDays <= 0) {
      setErrorMsg(
        'Rentang tanggal yang Anda pilih pada kalender tidak memiliki hari kerja efektif (contoh: hanya tanggal merah / akhir pekan). Silakan pilih hari kerja.'
      );
      return;
    }

    const insufficientQuota = quotaRows.find((row) => row.isOver);
    if (insufficientQuota) {
      setErrorMsg(
        `Sisa kuota ${insufficientQuota.name} tidak mencukupi (Sisa: ${insufficientQuota.remainingBefore} Hari, Pengajuan: ${calculatedDays} Hari).`
      );
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isAdmin ? { ...data, userId: selectedUserId } : data),
      });

      const json = await safeParseJson(res);
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal membuat pengajuan cuti');
      }

      router.push(isAdmin ? '/admin/leave-requests' : '/dashboard');
      router.refresh();
    } catch (err: any) {
      setErrorMsg(err.message);
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
              Isi formulir di bawah ini untuk mengajukan cuti atau izin meninggalkan kerja.
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

          {/* Section 1: Jenis Cuti */}
          <div className="w-full">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-bold text-slate-900">
                1. Pilih Jenis Cuti <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs text-slate-400">Klik kartu untuk memilih jenis cuti</span>
            </div>

            {errors.leaveTypeIds && (
              <p className="mb-3 text-xs font-semibold text-rose-600">
                {errors.leaveTypeIds.message}
              </p>
            )}

            {loadingLeaveTypes ? (
              <div className="py-8 text-center text-xs text-slate-400">Memuat jenis cuti...</div>
            ) : (
              <div className="space-y-6 w-full">
                {/* Category 1: CUTI */}
                <div className="bg-slate-50/80 p-5 rounded-xl border border-slate-200/80 w-full">
                  <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> Cuti
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3.5 w-full">
                    {cutiTypes.map((type) => {
                      const isSelected = selectedTypeIds.includes(type.id);
                      return (
                        <div
                          key={type.id}
                          onClick={() => handleSelectLeaveType(type.id)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                            isSelected
                              ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/30 shadow-sm'
                              : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <span
                              className={`text-xs font-bold transition-colors ${
                                isSelected ? 'text-indigo-950' : 'text-slate-800'
                              }`}
                            >
                              {type.name}
                            </span>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[11px] font-medium text-slate-500">Sisa Kuota / Jatah:</span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold transition-colors ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border border-indigo-600'
                                  : 'bg-indigo-100/70 text-indigo-900 border border-indigo-200'
                              }`}
                            >
                              {getQuotaDisplay(type)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Category 2: IZIN MENINGGALKAN */}
                <div className="bg-slate-50/80 p-5 rounded-xl border border-slate-200/80 w-full">
                  <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600" /> Izin Meninggalkan
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-3.5 w-full">
                    {izinTypes.map((type) => {
                      const isSelected = selectedTypeIds.includes(type.id);
                      return (
                        <div
                          key={type.id}
                          onClick={() => handleSelectLeaveType(type.id)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                            isSelected
                              ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-500/30 shadow-sm'
                              : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-slate-50/50'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-amber-600 border-amber-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                            <span
                              className={`text-xs font-bold transition-colors ${
                                isSelected ? 'text-amber-950' : 'text-slate-800'
                              }`}
                            >
                              {type.name}
                            </span>
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-[11px] font-medium text-slate-500">Sisa Kuota / Jatah:</span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold transition-colors ${
                                isSelected
                                  ? 'bg-amber-600 text-white border border-amber-600'
                                  : 'bg-amber-100/70 text-amber-900 border border-amber-200'
                              }`}
                            >
                              {getQuotaDisplay(type)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Interactive Single Range Calendar */}
          <div className="w-full space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900">
                2. Kalender Rentang Cuti <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs font-extrabold text-indigo-900 bg-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-200">
                Periode Terpilih: {formatDate(startDate)} — {formatDate(endDate)}
              </span>
            </div>

            {/* Visual Interactive Month Calendar Component */}
            <CalendarRangePicker
              startDate={startDate}
              endDate={endDate}
              onRangeChange={(start, end) => {
                setValue('startDate', start, { shouldValidate: true });
                setValue('endDate', end, { shouldValidate: true });
              }}
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
                    {selectedTypeIds.length === 0
                      ? '⚠️ Silakan klik jenis cuti di atas'
                      : 'Jumlah hari kerja efektif yang memotong kuota cuti'}
                  </p>
                </div>
              </div>

              <div className="flex items-baseline gap-2 bg-white text-indigo-950 px-6 py-2.5 rounded-xl font-black shadow-sm">
                <span className="text-3xl font-black text-indigo-600">{calculatedDays}</span>
                <span className="text-base font-extrabold text-slate-800">Hari Kerja</span>
              </div>
            </div>

            {/* Rincian Tanggal Merah & Libur Terdeteksi */}
            {(holidaysInRange.length > 0 || weekendDaysCount > 0) && (
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
                  {/* National Holidays List */}
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
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-rose-600 text-white shadow-2xs">
                        🔴 Libur Nasional
                      </span>
                    </div>
                  ))}

                  {/* Weekend Days Count */}
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
                      <span className="px-2.5 py-1 rounded-md text-[11px] font-black bg-amber-600 text-white shadow-2xs">
                        Libur Weekend
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Rincian Kuota per Jenis Cuti Terpilih */}
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-slate-900">3. Rincian Kuota Cuti</label>
              <span className="text-xs text-slate-400">
                Otomatis mengikuti jenis cuti &amp; tanggal terpilih
              </span>
            </div>

            {quotaRows.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 font-medium">
                Pilih jenis cuti terlebih dahulu untuk melihat rincian kuota (dipakai, sisa sebelum, dan sisa sesudah pengajuan).
              </div>
            ) : (
              <div className="space-y-3 w-full">
                {quotaRows.map((row) => (
                  <div
                    key={row.typeId}
                    className={`rounded-2xl border p-4 w-full animate-fadeIn ${
                      row.isOver ? 'bg-rose-50/80 border-rose-300' : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                      <span className="text-sm font-extrabold text-slate-900">{row.name}</span>
                      <span className="text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg">
                        Pengajuan ini: {calculatedDays} hari
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

          {/* Submit Action */}
          <div className="pt-6 border-t border-slate-100 flex items-center justify-end gap-3 w-full">
            <Link href={isAdmin ? '/admin/leave-requests' : '/dashboard'}>
              <Button type="button" variant="outline" size="lg">
                Batal
              </Button>
            </Link>
            <Button type="submit" disabled={submitting} size="lg">
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
            <h3 className="text-xl font-black text-rose-950 tracking-tight">
              Kau lanang cok
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto font-semibold pt-1">
              Jenis cuti ini (Cuti Bersalin / Cuti Gugur Kandungan) hanya diperuntukkan bagi karyawan berkategori perempuan.
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
