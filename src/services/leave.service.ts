import { prisma } from '@/lib/db';
import { LeaveStatus, QuotaHistoryType, CalculationType, Prisma } from '@prisma/client';
import { calculateLeaveDays } from '@/lib/calculation';
import { getHolidayDatesSet } from '@/services/holiday.service';
import { CreateLeaveRequestPayload, formatDateId, rangesOverlap } from '@/schemas/leave.schema';

/**
 * Segment yang sudah dinormalisasi (tanggal sudah berupa Date).
 * Satu pengajuan cuti bisa berisi beberapa segment, tiap segment punya jenis cuti sendiri.
 */
export interface NormalizedSegment {
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  order: number;
}

/** Segment hasil hitung: ditambah total hari & data jenis cutinya. */
export interface ComputedSegment extends NormalizedSegment {
  totalDays: number;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * Bangun daftar segment dari input pengajuan.
 * - Bentuk baru: `segments[]` dipakai apa adanya.
 * - Bentuk lama: `leaveTypeIds` + `startDate`/`endDate` dibangun menjadi SATU segment
 *   otomatis (jenis cuti pertama) agar klien lama tetap jalan.
 */
export function buildSegmentsFromInput(input: CreateLeaveRequestPayload): NormalizedSegment[] {
  const segments = input.segments ?? [];

  if (segments.length > 0) {
    return segments.map((segment, index) => ({
      leaveTypeId: segment.leaveTypeId,
      startDate: new Date(segment.startDate),
      endDate: new Date(segment.endDate),
      order: index,
    }));
  }

  if (!input.leaveTypeIds?.length || !input.startDate || !input.endDate) {
    throw new Error('Rentang tanggal cuti wajib diisi');
  }

  return [
    {
      leaveTypeId: input.leaveTypeIds[0],
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      order: 0,
    },
  ];
}

/**
 * Hitung total hari tiap segment memakai `calculateLeaveDays()` dengan
 * `calculationType` jenis cuti segment tersebut + daftar hari libur.
 */
export function computeSegments(
  segments: NormalizedSegment[],
  leaveTypeMap: Map<string, { id: string; name: string; calculationType: CalculationType | string }>,
  holidayDatesSet: Set<string>,
  legacyCalculationTypes?: (CalculationType | string)[]
): ComputedSegment[] {
  return segments.map((segment) => {
    const leaveType = leaveTypeMap.get(segment.leaveTypeId);
    if (!leaveType) {
      throw new Error('Jenis cuti yang dipilih tidak valid');
    }

    const calcTypes = legacyCalculationTypes ?? [leaveType.calculationType];
    const totalDays = calculateLeaveDays(
      segment.startDate,
      segment.endDate,
      calcTypes,
      holidayDatesSet
    );

    return { ...segment, totalDays };
  });
}

/** Envelope agregat: start paling awal, end paling akhir, total = jumlah seluruh segment. */
export function buildEnvelope(segments: ComputedSegment[]) {
  if (segments.length === 0) {
    throw new Error('Minimal satu rentang tanggal');
  }

  return {
    startDate: new Date(Math.min(...segments.map((s) => s.startDate.getTime()))),
    endDate: new Date(Math.max(...segments.map((s) => s.endDate.getTime()))),
    totalDays: segments.reduce((sum, s) => sum + s.totalDays, 0),
  };
}

interface SegmentLike {
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
}

interface TypeDayGroup {
  leaveTypeId: string;
  year: number;
  days: number;
  ranges: Array<{ startDate: Date; endDate: Date }>;
}

/**
 * Kelompokkan hari per (jenis cuti, tahun) dari daftar segment.
 * Dipakai untuk cek kuota & potong/refund kuota PER JENIS CUTI.
 */
export function groupDaysByTypeAndYear(segments: SegmentLike[]): TypeDayGroup[] {
  const map = new Map<string, TypeDayGroup>();

  for (const segment of segments) {
    const year = segment.startDate.getFullYear();
    const key = `${segment.leaveTypeId}|${year}`;
    const entry =
      map.get(key) ?? { leaveTypeId: segment.leaveTypeId, year, days: 0, ranges: [] };
    entry.days += segment.totalDays;
    entry.ranges.push({ startDate: segment.startDate, endDate: segment.endDate });
    map.set(key, entry);
  }

  return Array.from(map.values());
}

/** "01/10/2026 - 03/10/2026, 10/10/2026 - 11/10/2026" */
export function describeRanges(ranges: Array<{ startDate: Date; endDate: Date }>): string {
  return ranges
    .map((r) => `${formatDateId(r.startDate)} - ${formatDateId(r.endDate)}`)
    .join(', ');
}

const STATUS_LABEL: Record<string, string> = {
  ON_PROGRESS: 'Menunggu Persetujuan',
  APPROVED: 'Disetujui',
  DONE: 'Selesai',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
};

/** Nama jenis cuti tahunan (dipakai untuk sinkronisasi kuota tahunan generik). */
const ANNUAL_LEAVE_NAME = 'Cuti Tahunan';
const UNLIMITED_QUOTA_THRESHOLD = 999;

export interface LeaveFilterOptions {
  userId?: string;
  leaveTypeId?: string;
  status?: LeaveStatus;
  startDate?: string;
  endDate?: string;
  month?: number;
  year?: number;
  searchUser?: string;
}

export async function createLeaveRequest(userId: string, input: CreateLeaveRequestPayload) {
  const user = await prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
  if (!user) {
    throw new Error('Sesi pengguna telah kadaluarsa. Silakan keluar (logout) dan login kembali.');
  }

  const isLegacy = !input.segments || input.segments.length === 0;
  const segments = buildSegmentsFromInput(input);
  const segmentTypeIds = unique(segments.map((s) => s.leaveTypeId));

  // 1. Fetch jenis cuti yang dipakai seluruh segment
  const leaveTypes = await prisma.leaveType.findMany({
    where: { id: { in: segmentTypeIds } },
  });

  if (leaveTypes.length !== segmentTypeIds.length) {
    throw new Error('Jenis cuti yang dipilih tidak valid');
  }

  const leaveTypeMap = new Map(leaveTypes.map((t) => [t.id, t]));

  // 2. Hitung total hari PER SEGMENT (calculationType jenis cuti masing-masing segment)
  const holidayDatesSet = await getHolidayDatesSet();
  const computedSegments = computeSegments(
    segments,
    leaveTypeMap,
    holidayDatesSet,
    // Bentuk lama: beberapa jenis cuti pada satu rentang → pakai seluruh mode perhitungan (perilaku lama)
    isLegacy ? leaveTypes.map((t) => t.calculationType) : undefined
  );

  // 3. Envelope agregat (start paling awal, end paling akhir, total = jumlah segment)
  const envelope = buildEnvelope(computedSegments);
  const startDate = envelope.startDate;
  const endDate = envelope.endDate;
  const totalDays = envelope.totalDays;

  if (totalDays <= 0) {
    throw new Error(
      'Total hari cuti 0 hari. Periksa kembali rentang tanggal dan jenis cuti yang dipilih (akhir pekan / hari libur tidak dihitung untuk jenis cuti hari kerja).'
    );
  }

  // Pivot jenis cuti (unik) — tetap diisi demi kompatibilitas list/filter lama
  const requestTypeIds = isLegacy
    ? unique(input.leaveTypeIds ?? segmentTypeIds)
    : segmentTypeIds;

  // 4. Cek overlap PER SEGMENT terhadap pengajuan lain milik user
  //    (bukan hanya envelope, supaya rentang yang lompat tetap terdeteksi)
  const conflictingSegments = await prisma.leaveRequestSegment.findMany({
    where: {
      leaveRequest: {
        userId,
        deletedAt: null,
        status: { in: [LeaveStatus.ON_PROGRESS, LeaveStatus.APPROVED, LeaveStatus.DONE] },
      },
    },
    include: {
      leaveType: true,
      leaveRequest: { select: { id: true, status: true } },
    },
  });

  for (const segment of computedSegments) {
    const conflict = conflictingSegments.find((existing) =>
      rangesOverlap(
        { startDate: segment.startDate, endDate: segment.endDate },
        { startDate: existing.startDate, endDate: existing.endDate }
      )
    );

    if (conflict) {
      const segmentType = leaveTypeMap.get(segment.leaveTypeId);
      const conflictStatus = STATUS_LABEL[conflict.leaveRequest.status] ?? conflict.leaveRequest.status;
      throw new Error(
        `Rentang ${formatDateId(segment.startDate)} - ${formatDateId(segment.endDate)} (${segmentType?.name ?? 'Cuti'}) bentrok dengan pengajuan yang sudah ada: ${conflict.leaveType.name} ${formatDateId(conflict.startDate)} - ${formatDateId(conflict.endDate)} (status: ${conflictStatus}). Silakan pilih tanggal lain.`
      );
    }
  }

  // 5. Cek kuota PER JENIS CUTI (bukan kuota generik)
  const daysByType = groupDaysByTypeAndYear(computedSegments);
  const genericQuota = await prisma.leaveQuota.findUnique({ where: { userId } });
  const genericRemaining = genericQuota ? genericQuota.totalQuota - genericQuota.usedQuota : 12;

  for (const group of daysByType) {
    const leaveType = leaveTypeMap.get(group.leaveTypeId);
    if (!leaveType) continue;

    const typeQuota = await prisma.userLeaveQuota.findFirst({
      where: { userId, leaveTypeId: group.leaveTypeId, year: group.year },
    });

    if (typeQuota && typeQuota.totalQuota < UNLIMITED_QUOTA_THRESHOLD) {
      const remaining = typeQuota.totalQuota - typeQuota.usedQuota;
      if (group.days > remaining) {
        throw new Error(
          `Sisa kuota ${leaveType.name} tidak mencukupi (Sisa: ${remaining} Hari, Pengajuan: ${group.days} Hari pada rentang ${describeRanges(group.ranges)}).`
        );
      }
    } else if (!typeQuota && leaveType.category === 'CUTI') {
      // Fallback kompatibilitas: belum ada kuota per jenis → pakai kuota tahunan generik
      if (group.days > genericRemaining) {
        throw new Error(
          `Sisa kuota ${leaveType.name} tidak mencukupi (Sisa: ${genericRemaining} Hari, Pengajuan: ${group.days} Hari pada rentang ${describeRanges(group.ranges)}).`
        );
      }
    }
  }

  // 6. Simpan pengajuan + segment (nested create) + pivot jenis cuti
  return prisma.leaveRequest.create({
    data: {
      userId,
      startDate,
      endDate,
      totalDays,
      reason: input.reason,
      attachmentUrl: input.attachmentUrl,
      status: LeaveStatus.ON_PROGRESS,
      requestTypes: {
        create: requestTypeIds.map((ltId) => ({ leaveTypeId: ltId })),
      },
      segments: {
        create: computedSegments.map((segment) => ({
          leaveTypeId: segment.leaveTypeId,
          startDate: segment.startDate,
          endDate: segment.endDate,
          totalDays: segment.totalDays,
          order: segment.order,
        })),
      },
    },
    include: {
      requestTypes: {
        include: {
          leaveType: true,
        },
      },
      segments: {
        include: { leaveType: true },
        orderBy: { order: 'asc' },
      },
    },
  });
}

export async function updateLeaveRequest(
  requestId: string,
  userId: string,
  isAdmin: boolean,
  input: Partial<CreateLeaveRequestPayload>
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        user: { include: { quota: true } },
        requestTypes: { include: { leaveType: true } },
        segments: { include: { leaveType: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!existing || existing.deletedAt) {
      throw new Error('Pengajuan cuti tidak ditemukan');
    }

    if (existing.status === LeaveStatus.DONE || existing.status === LeaveStatus.CANCELLED) {
      throw new Error('Pengajuan cuti yang telah berstatus DONE (Selesai) atau CANCELLED tidak dapat diubah lagi.');
    }

    if (!isAdmin && existing.userId !== userId) {
      throw new Error('Anda tidak memiliki akses untuk mengubah pengajuan ini');
    }

    // --- Susun segment hasil edit -------------------------------------------------
    // 1) `segments[]` dikirim → pakai apa adanya (bentuk baru)
    // 2) bentuk lama (leaveTypeIds + startDate/endDate) → satu segment otomatis
    // 3) tidak ada perubahan rentang → pakai segment yang sudah tersimpan
    const hasSegmentsInput = Array.isArray(input.segments) && input.segments.length > 0;
    const hasLegacyRange = !!input.startDate || !!input.endDate || !!input.leaveTypeIds;

    let segments: NormalizedSegment[];

    if (hasSegmentsInput) {
      segments = buildSegmentsFromInput(input as CreateLeaveRequestPayload);
    } else if (hasLegacyRange) {
      const legacyTypeIds = input.leaveTypeIds?.length
        ? input.leaveTypeIds
        : existing.requestTypes.map((r) => r.leaveTypeId);
      if (!legacyTypeIds.length) {
        throw new Error('Pilih minimal satu jenis cuti');
      }
      segments = [
        {
          leaveTypeId: legacyTypeIds[0],
          startDate: input.startDate ? new Date(input.startDate) : existing.startDate,
          endDate: input.endDate ? new Date(input.endDate) : existing.endDate,
          order: 0,
        },
      ];
    } else if (existing.segments.length > 0) {
      segments = existing.segments.map((s) => ({
        leaveTypeId: s.leaveTypeId,
        startDate: s.startDate,
        endDate: s.endDate,
        order: s.order,
      }));
    } else {
      const fallbackTypeId = existing.requestTypes[0]?.leaveTypeId;
      if (!fallbackTypeId) {
        throw new Error('Pilih minimal satu jenis cuti');
      }
      segments = [
        {
          leaveTypeId: fallbackTypeId,
          startDate: existing.startDate,
          endDate: existing.endDate,
          order: 0,
        },
      ];
    }

    const segmentTypeIds = unique(segments.map((s) => s.leaveTypeId));
    const leaveTypes = await tx.leaveType.findMany({
      where: { id: { in: segmentTypeIds } },
    });

    if (leaveTypes.length !== segmentTypeIds.length) {
      throw new Error('Jenis cuti yang dipilih tidak valid');
    }

    const leaveTypeMap = new Map(leaveTypes.map((t) => [t.id, t]));
    const holidayDatesSet = await getHolidayDatesSet();
    const isLegacyCalc = !hasSegmentsInput && segments.length === 1 && (input.leaveTypeIds?.length ?? 0) > 1;

    const computedSegments = computeSegments(
      segments,
      leaveTypeMap,
      holidayDatesSet,
      isLegacyCalc ? leaveTypes.map((t) => t.calculationType) : undefined
    );

    const envelope = buildEnvelope(computedSegments);
    const startDate = envelope.startDate;
    const endDate = envelope.endDate;
    const newTotalDays = envelope.totalDays;

    if (newTotalDays <= 0) {
      throw new Error(
        'Total hari cuti 0 hari. Periksa kembali rentang tanggal dan jenis cuti yang dipilih.'
      );
    }

    const requestTypeIds = hasSegmentsInput
      ? segmentTypeIds
      : input.leaveTypeIds?.length
        ? unique(input.leaveTypeIds)
        : segmentTypeIds;

    // Cek overlap PER SEGMENT terhadap pengajuan lain (kecuali pengajuan ini sendiri)
    const conflictingSegments = await tx.leaveRequestSegment.findMany({
      where: {
        leaveRequestId: { not: requestId },
        leaveRequest: {
          userId: existing.userId,
          deletedAt: null,
          status: { in: [LeaveStatus.ON_PROGRESS, LeaveStatus.APPROVED, LeaveStatus.DONE] },
        },
      },
      include: { leaveType: true, leaveRequest: { select: { id: true, status: true } } },
    });

    for (const segment of computedSegments) {
      const conflict = conflictingSegments.find((existingSegment) =>
        rangesOverlap(
          { startDate: segment.startDate, endDate: segment.endDate },
          { startDate: existingSegment.startDate, endDate: existingSegment.endDate }
        )
      );

      if (conflict) {
        const segmentType = leaveTypeMap.get(segment.leaveTypeId);
        const conflictStatus =
          STATUS_LABEL[conflict.leaveRequest.status] ?? conflict.leaveRequest.status;
        throw new Error(
          `Rentang ${formatDateId(segment.startDate)} - ${formatDateId(segment.endDate)} (${
            segmentType?.name ?? 'Cuti'
          }) bentrok dengan pengajuan lain: ${conflict.leaveType.name} ${formatDateId(
            conflict.startDate
          )} - ${formatDateId(conflict.endDate)} (status: ${conflictStatus}).`
        );
      }
    }

    // Perubahan pada pengajuan yang sudah APPROVED → sesuaikan kuota PER JENIS CUTI
    if (existing.status === LeaveStatus.APPROVED) {
      const leaveTypeNameById = new Map<string, string>();
      existing.segments.forEach((s) => leaveTypeNameById.set(s.leaveTypeId, s.leaveType.name));
      leaveTypes.forEach((t) => leaveTypeNameById.set(t.id, t.name));

      const groupKey = (g: { leaveTypeId: string; year: number }) => `${g.leaveTypeId}|${g.year}`;
      const oldGroups = groupDaysByTypeAndYear(existing.segments);
      const newGroups = groupDaysByTypeAndYear(computedSegments);
      const oldMap = new Map(oldGroups.map((g) => [groupKey(g), g]));
      const newMap = new Map(newGroups.map((g) => [groupKey(g), g]));

      for (const key of unique([...oldMap.keys(), ...newMap.keys()])) {
        const oldGroup = oldMap.get(key);
        const newGroup = newMap.get(key);
        const diff = (newGroup?.days ?? 0) - (oldGroup?.days ?? 0);
        if (diff === 0) continue;

        const leaveTypeId = (newGroup ?? oldGroup)!.leaveTypeId;
        const year = (newGroup ?? oldGroup)!.year;
        const typeName = leaveTypeNameById.get(leaveTypeId) ?? 'Cuti';
        const ranges = newGroup?.ranges ?? oldGroup?.ranges ?? [];

        const typeQuota = await tx.userLeaveQuota.findFirst({
          where: { userId: existing.userId, leaveTypeId, year },
        });

        if (typeQuota) {
          const remaining = typeQuota.totalQuota - typeQuota.usedQuota;
          if (diff > remaining) {
            throw new Error(
              `Sisa kuota ${typeName} tidak mencukupi untuk penambahan ${diff} hari (sisa ${remaining} hari).`
            );
          }

          await tx.userLeaveQuota.update({
            where: { id: typeQuota.id },
            data: { usedQuota: Math.max(0, typeQuota.usedQuota + diff) },
          });

          await tx.leaveQuotaHistory.create({
            data: {
              userId: existing.userId,
              leaveRequestId: existing.id,
              leaveTypeId,
              previousQuota: remaining,
              changeAmount: -diff,
              newQuota: remaining - diff,
              type: QuotaHistoryType.LEAVE_DAYS_UPDATED,
              description: `Perubahan rentang pengajuan disetujui — ${typeName} (${describeRanges(ranges)}): ${
                diff > 0 ? 'bertambah' : 'berkurang'
              } ${Math.abs(diff)} Hari`,
            },
          });
        }

        // Sinkronkan kuota tahunan generik (LeaveQuota) hanya untuk Cuti Tahunan
        if (typeName === ANNUAL_LEAVE_NAME && existing.user.quota) {
          await tx.leaveQuota.update({
            where: { userId: existing.userId },
            data: { usedQuota: Math.max(0, existing.user.quota.usedQuota + diff) },
          });
        }
      }
    }

    // Ganti pivot jenis cuti & segment dengan versi terbaru
    await tx.leaveRequestType.deleteMany({ where: { leaveRequestId: requestId } });
    await tx.leaveRequestType.createMany({
      data: requestTypeIds.map((ltId) => ({ leaveRequestId: requestId, leaveTypeId: ltId })),
    });

    await tx.leaveRequestSegment.deleteMany({ where: { leaveRequestId: requestId } });
    await tx.leaveRequestSegment.createMany({
      data: computedSegments.map((segment) => ({
        leaveRequestId: requestId,
        leaveTypeId: segment.leaveTypeId,
        startDate: segment.startDate,
        endDate: segment.endDate,
        totalDays: segment.totalDays,
        order: segment.order,
      })),
    });

    return tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        startDate,
        endDate,
        totalDays: newTotalDays,
        reason: input.reason ?? existing.reason,
        attachmentUrl: input.attachmentUrl !== undefined ? input.attachmentUrl : existing.attachmentUrl,
      },
      include: {
        requestTypes: { include: { leaveType: true } },
        segments: { include: { leaveType: true }, orderBy: { order: 'asc' } },
      },
    });
  });
}

export async function updateLeaveStatus(
  requestId: string,
  newStatus: LeaveStatus,
  adminNote?: string | null
) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        user: { include: { quota: true } },
        requestTypes: { include: { leaveType: true } },
        segments: { include: { leaveType: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!request || request.deletedAt) {
      throw new Error('Pengajuan cuti tidak ditemukan');
    }

    const previousStatus = request.status;

    // Preventive Check: Double deduction protection
    if (previousStatus === newStatus) {
      return request;
    }

    const userId = request.userId;
    const userQuota = request.user.quota;

    if (!userQuota) {
      throw new Error('Data kuota user tidak ditemukan');
    }

    // Rincian hari PER JENIS CUTI dari segment (fallback ke requestTypes untuk data sangat lama)
    const segmentsForQuota =
      request.segments.length > 0
        ? request.segments
        : request.requestTypes.map((rt) => ({
            leaveTypeId: rt.leaveTypeId,
            leaveType: rt.leaveType,
            startDate: request.startDate,
            endDate: request.endDate,
            totalDays: request.totalDays,
          }));

    const daysByType = groupDaysByTypeAndYear(segmentsForQuota);
    const typeNameById = new Map<string, string>();
    segmentsForQuota.forEach((s) => typeNameById.set(s.leaveTypeId, s.leaveType.name));
    request.requestTypes.forEach((rt) => typeNameById.set(rt.leaveTypeId, rt.leaveType.name));

    const isDeducting =
      previousStatus !== LeaveStatus.APPROVED &&
      previousStatus !== LeaveStatus.DONE &&
      (newStatus === LeaveStatus.APPROVED || newStatus === LeaveStatus.DONE);

    const isRefunding =
      (previousStatus === LeaveStatus.APPROVED || previousStatus === LeaveStatus.DONE) &&
      newStatus !== LeaveStatus.APPROVED &&
      newStatus !== LeaveStatus.DONE;

    if (isDeducting) {
      // 1. Potong kuota PER JENIS CUTI
      for (const group of daysByType) {
        const typeName = typeNameById.get(group.leaveTypeId) ?? 'Cuti';
        const typeQuota = await tx.userLeaveQuota.findFirst({
          where: { userId, leaveTypeId: group.leaveTypeId, year: group.year },
        });

        if (!typeQuota) {
          continue;
        }

        const remaining = typeQuota.totalQuota - typeQuota.usedQuota;
        if (group.days > remaining && typeQuota.totalQuota < UNLIMITED_QUOTA_THRESHOLD) {
          throw new Error(
            `Sisa kuota ${typeName} tidak mencukupi (Sisa: ${remaining} Hari, Pengajuan: ${group.days} Hari pada rentang ${describeRanges(group.ranges)})`
          );
        }

        await tx.userLeaveQuota.update({
          where: { id: typeQuota.id },
          data: { usedQuota: typeQuota.usedQuota + group.days },
        });

        await tx.leaveQuotaHistory.create({
          data: {
            userId,
            leaveRequestId: request.id,
            leaveTypeId: group.leaveTypeId,
            previousQuota: remaining,
            changeAmount: -group.days,
            newQuota: remaining - group.days,
            type: QuotaHistoryType.LEAVE_APPROVED,
            description: `Pengajuan cuti ${STATUS_LABEL[newStatus] ?? newStatus} — ${typeName} (${describeRanges(
              group.ranges
            )}): ${group.days} Hari`,
          },
        });
      }

      // 2. Sinkronkan kuota tahunan generik (LeaveQuota) untuk Cuti Tahunan
      const annualDays = daysByType
        .filter((group) => typeNameById.get(group.leaveTypeId) === ANNUAL_LEAVE_NAME)
        .reduce((sum, group) => sum + group.days, 0);

      if (annualDays > 0) {
        const currentRemaining = userQuota.totalQuota - userQuota.usedQuota;
        if (annualDays > currentRemaining) {
          throw new Error(
            `Kuota cuti tahunan tidak mencukupi (Sisa: ${currentRemaining} Hari, Pengajuan: ${annualDays} Hari)`
          );
        }

        await tx.leaveQuota.update({
          where: { userId },
          data: { usedQuota: userQuota.usedQuota + annualDays },
        });

        // Baris sinkronisasi kuota tahunan generik (tabel LeaveQuota lama).
        // `leaveTypeId` sengaja NULL: hari Cuti Tahunan sudah tercatat pada baris
        // per jenis cuti di atas (UserLeaveQuota). Kalau baris ini diberi jenis cuti,
        // rincian kuota per pengajuan akan menghitung hari yang sama dua kali.
        await tx.leaveQuotaHistory.create({
          data: {
            userId,
            leaveRequestId: request.id,
            leaveTypeId: null,
            previousQuota: currentRemaining,
            changeAmount: -annualDays,
            newQuota: currentRemaining - annualDays,
            type: QuotaHistoryType.LEAVE_APPROVED,
            description: `Pengajuan cuti disetujui / diselesaikan (${ANNUAL_LEAVE_NAME}: ${annualDays} Hari)`,
          },
        });
      }
    } else if (isRefunding) {
      const historyType =
        newStatus === LeaveStatus.CANCELLED
          ? QuotaHistoryType.LEAVE_CANCELLED
          : QuotaHistoryType.LEAVE_REJECTED_AFTER_APPROVAL;

      // 1. Kembalikan kuota PER JENIS CUTI
      for (const group of daysByType) {
        const typeName = typeNameById.get(group.leaveTypeId) ?? 'Cuti';
        const typeQuota = await tx.userLeaveQuota.findFirst({
          where: { userId, leaveTypeId: group.leaveTypeId, year: group.year },
        });

        if (!typeQuota) {
          continue;
        }

        const remaining = typeQuota.totalQuota - typeQuota.usedQuota;

        await tx.userLeaveQuota.update({
          where: { id: typeQuota.id },
          data: { usedQuota: Math.max(0, typeQuota.usedQuota - group.days) },
        });

        await tx.leaveQuotaHistory.create({
          data: {
            userId,
            leaveRequestId: request.id,
            leaveTypeId: group.leaveTypeId,
            previousQuota: remaining,
            changeAmount: group.days,
            newQuota: remaining + group.days,
            type: historyType,
            description: `${newStatus === LeaveStatus.CANCELLED ? 'Pembatalan' : 'Penolakan'} pengajuan cuti — ${typeName} (${describeRanges(
              group.ranges
            )}): +${group.days} Hari`,
          },
        });
      }

      // 2. Sinkronkan kuota tahunan generik (LeaveQuota) untuk Cuti Tahunan
      const annualDays = daysByType
        .filter((group) => typeNameById.get(group.leaveTypeId) === ANNUAL_LEAVE_NAME)
        .reduce((sum, group) => sum + group.days, 0);

      if (annualDays > 0) {
        const currentRemaining = userQuota.totalQuota - userQuota.usedQuota;

        await tx.leaveQuota.update({
          where: { userId },
          data: { usedQuota: Math.max(0, userQuota.usedQuota - annualDays) },
        });

        // Sinkronisasi kuota tahunan generik — `leaveTypeId` NULL (lihat catatan di alur potong kuota).
        await tx.leaveQuotaHistory.create({
          data: {
            userId,
            leaveRequestId: request.id,
            leaveTypeId: null,
            previousQuota: currentRemaining,
            changeAmount: annualDays,
            newQuota: currentRemaining + annualDays,
            type: historyType,
            description: `${newStatus === LeaveStatus.CANCELLED ? 'Pembatalan' : 'Penolakan'} pengajuan cuti (+${annualDays} Hari ${ANNUAL_LEAVE_NAME})`,
          },
        });
      }
    }

    // Update Leave Request status
    return tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        adminNote: adminNote !== undefined ? adminNote : request.adminNote,
      },
      include: {
        requestTypes: { include: { leaveType: true } },
        segments: { include: { leaveType: true }, orderBy: { order: 'asc' } },
      },
    });
  });
}

export async function deleteLeaveRequest(requestId: string, userId: string, isAdmin: boolean) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        user: { include: { quota: true } },
        requestTypes: { include: { leaveType: true } },
        segments: { include: { leaveType: true }, orderBy: { order: 'asc' } },
      },
    });

    if (!request || request.deletedAt) {
      throw new Error('Pengajuan cuti tidak ditemukan');
    }

    if (!isAdmin && request.userId !== userId) {
      throw new Error('Anda tidak berhak menghapus pengajuan ini');
    }

    // Jika pengajuan APPROVED/DONE dihapus, kembalikan kuota PER JENIS CUTI
    if ((request.status === LeaveStatus.APPROVED || request.status === LeaveStatus.DONE) && request.user.quota) {
      const segmentsForQuota =
        request.segments.length > 0
          ? request.segments
          : request.requestTypes.map((rt) => ({
              leaveTypeId: rt.leaveTypeId,
              leaveType: rt.leaveType,
              startDate: request.startDate,
              endDate: request.endDate,
              totalDays: request.totalDays,
            }));

      const daysByType = groupDaysByTypeAndYear(segmentsForQuota);
      const typeNameById = new Map<string, string>();
      segmentsForQuota.forEach((s) => typeNameById.set(s.leaveTypeId, s.leaveType.name));

      for (const group of daysByType) {
        const typeName = typeNameById.get(group.leaveTypeId) ?? 'Cuti';
        const typeQuota = await tx.userLeaveQuota.findFirst({
          where: { userId: request.userId, leaveTypeId: group.leaveTypeId, year: group.year },
        });

        if (!typeQuota) continue;

        const remaining = typeQuota.totalQuota - typeQuota.usedQuota;

        await tx.userLeaveQuota.update({
          where: { id: typeQuota.id },
          data: { usedQuota: Math.max(0, typeQuota.usedQuota - group.days) },
        });

        await tx.leaveQuotaHistory.create({
          data: {
            userId: request.userId,
            leaveRequestId: null, // Histori tetap disimpan walau pengajuan dihapus
            leaveTypeId: group.leaveTypeId,
            previousQuota: remaining,
            changeAmount: group.days,
            newQuota: remaining + group.days,
            type: QuotaHistoryType.LEAVE_CANCELLED,
            description: `Pengembalian kuota karena pengajuan dihapus — ${typeName} (${describeRanges(
              group.ranges
            )}): +${group.days} Hari`,
          },
        });
      }

      // Kuota tahunan generik hanya untuk Cuti Tahunan
      const annualDays = daysByType
        .filter((group) => typeNameById.get(group.leaveTypeId) === ANNUAL_LEAVE_NAME)
        .reduce((sum, group) => sum + group.days, 0);

      if (annualDays > 0) {
        const currentRemaining = request.user.quota.totalQuota - request.user.quota.usedQuota;

        await tx.leaveQuota.update({
          where: { userId: request.userId },
          data: { usedQuota: Math.max(0, request.user.quota.usedQuota - annualDays) },
        });

        await tx.leaveQuotaHistory.create({
          data: {
            userId: request.userId,
            leaveRequestId: null,
            leaveTypeId: null, // sinkronisasi kuota tahunan generik, bukan kuota per jenis cuti
            previousQuota: currentRemaining,
            changeAmount: annualDays,
            newQuota: currentRemaining + annualDays,
            type: QuotaHistoryType.LEAVE_CANCELLED,
            description: `Pengembalian kuota karena pengajuan cuti disetujui/selesai dihapus (+${annualDays} Hari ${ANNUAL_LEAVE_NAME})`,
          },
        });
      }
    }

    return tx.leaveRequest.update({
      where: { id: requestId },
      data: { deletedAt: new Date() },
    });
  });
}

/** Rincian kuota satu jenis cuti pada satu pengajuan. */
export interface QuotaInfoPerType {
  leaveTypeId: string;
  leaveTypeName: string;
  /** Total hari jenis cuti ini pada pengajuan (dari `segments`). */
  daysRequested: number;
  /** Sisa kuota SEBELUM pengajuan ini (snapshot history). null = tak terbatas / tidak diketahui. */
  previousRemaining: number | null;
  /** Hari yang benar-benar dipotong oleh pengajuan ini. */
  usedByThisRequest: number;
  /** Sisa kuota SETELAH pengajuan ini (snapshot history). null = tak terbatas / tidak diketahui. */
  remainingAfter: number | null;
  /** Sisa kuota SEKARANG (live dari `UserLeaveQuota`). null = tak terbatas (>= 999) / belum ada kuota. */
  currentRemaining: number | null;
}

export interface QuotaInfo {
  perType: QuotaInfoPerType[];
  totalDaysRequested: number;
  totalUsedByThisRequest: number;
  /** false = pengajuan ini belum/tidak memotong kuota (ON_PROGRESS / REJECTED / CANCELLED). */
  statusAffectsQuota: boolean;
}

interface QuotaInfoSegment {
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  leaveType?: { id: string; name: string } | null;
}

interface QuotaInfoRequest {
  id: string;
  userId: string;
  status: LeaveStatus;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  segments: QuotaInfoSegment[];
  requestTypes: Array<{ leaveTypeId: string; leaveType?: { id: string; name: string } | null }>;
}

interface QuotaHistoryRow {
  leaveRequestId: string | null;
  leaveTypeId: string | null;
  previousQuota: number;
  changeAmount: number;
  newQuota: number;
  createdAt: Date;
  leaveType: { id: string; name: string } | null;
}

interface QuotaSnapshotRow {
  totalQuota: number;
  usedQuota: number;
}

/**
 * Agregasi hari per jenis cuti beserta tahun-tahun yang terpakai.
 * Sumber utama `segments`; data lama tanpa segments memakai `requestTypes` + `totalDays`.
 */
function collectDaysAndYears(req: QuotaInfoRequest) {
  const days = new Map<string, number>();
  const years = new Map<string, Set<number>>();
  const names = new Map<string, string>();

  const add = (leaveTypeId: string, dayCount: number, year: number, name?: string | null) => {
    days.set(leaveTypeId, (days.get(leaveTypeId) ?? 0) + dayCount);
    const set = years.get(leaveTypeId) ?? new Set<number>();
    set.add(year);
    years.set(leaveTypeId, set);
    if (name) names.set(leaveTypeId, name);
  };

  if (req.segments.length > 0) {
    for (const segment of req.segments) {
      add(segment.leaveTypeId, segment.totalDays, segment.startDate.getFullYear(), segment.leaveType?.name);
    }
  } else {
    // Data lama tanpa segments: `totalDays` hanya pasti untuk satu jenis cuti,
    // jadi dibebankan ke jenis pertama dan sisanya 0 hari.
    req.requestTypes.forEach((requestType, index) => {
      add(
        requestType.leaveTypeId,
        index === 0 ? req.totalDays : 0,
        req.startDate.getFullYear(),
        requestType.leaveType?.name
      );
    });
  }

  return { days, years, names };
}

/** Sisa kuota live untuk satu jenis cuti (dijumlah lintas tahun kalau pengajuan melewati tahun). */
function resolveCurrentRemaining(
  userId: string,
  leaveTypeId: string,
  years: Set<number>,
  quotaMap: Map<string, QuotaSnapshotRow>
): { current: number | null; unlimited: boolean } {
  let total = 0;
  let found = false;

  for (const year of years) {
    const quota = quotaMap.get(`${userId}|${leaveTypeId}|${year}`);
    if (!quota) continue;
    if (quota.totalQuota >= UNLIMITED_QUOTA_THRESHOLD) {
      return { current: null, unlimited: true };
    }
    total += quota.totalQuota - quota.usedQuota;
    found = true;
  }

  return { current: found ? total : null, unlimited: false };
}

/**
 * Total kuota satu jenis cuti (dijumlah lintas tahun kalau pengajuan melewati tahun).
 * `known=false` → user belum punya baris `UserLeaveQuota` untuk jenis itu.
 */
function resolveTotalQuota(
  userId: string,
  leaveTypeId: string,
  years: Set<number>,
  quotaMap: Map<string, QuotaSnapshotRow>
): { total: number; unlimited: boolean; known: boolean } {
  let total = 0;
  let found = false;

  for (const year of years) {
    const quota = quotaMap.get(`${userId}|${leaveTypeId}|${year}`);
    if (!quota) continue;
    if (quota.totalQuota >= UNLIMITED_QUOTA_THRESHOLD) {
      return { total: quota.totalQuota, unlimited: true, known: true };
    }
    total += quota.totalQuota;
    found = true;
  }

  return { total, unlimited: false, known: found };
}

/**
 * Tambahkan `quotaInfo` (rincian kuota per jenis cuti) ke setiap pengajuan.
 * Hanya 2 query tambahan untuk seluruh daftar (tanpa N+1): semua baris
 * `LeaveQuotaHistory` pengajuan-pengajuan itu + semua `UserLeaveQuota` user terkait,
 * lalu dipetakan di memori.
 */
export async function attachQuotaInfo<T extends QuotaInfoRequest>(
  requests: T[]
): Promise<Array<T & { quotaInfo: QuotaInfo }>> {
  if (requests.length === 0) return [];

  const requestIds = requests.map((req) => req.id);
  const userIds = unique(requests.map((req) => req.userId));

  // Query 1: seluruh baris pemotongan kuota untuk pengajuan-pengajuan ini
  const histories: QuotaHistoryRow[] = await prisma.leaveQuotaHistory.findMany({
    where: {
      leaveRequestId: { in: requestIds },
      type: QuotaHistoryType.LEAVE_APPROVED,
    },
    select: {
      leaveRequestId: true,
      leaveTypeId: true,
      previousQuota: true,
      changeAmount: true,
      newQuota: true,
      createdAt: true,
      leaveType: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const yearSet = new Set<number>();
  for (const req of requests) {
    yearSet.add(req.startDate.getFullYear());
    for (const segment of req.segments) yearSet.add(segment.startDate.getFullYear());
  }

  // Query 2: kuota live per jenis cuti untuk user & tahun yang relevan
  const quotas = await prisma.userLeaveQuota.findMany({
    where: { userId: { in: userIds }, year: { in: Array.from(yearSet) } },
    select: { userId: true, leaveTypeId: true, year: true, totalQuota: true, usedQuota: true },
  });

  const quotaMap = new Map<string, QuotaSnapshotRow>(
    quotas.map((quota) => [`${quota.userId}|${quota.leaveTypeId}|${quota.year}`, quota])
  );

  // Kelompokkan history per pengajuan per jenis cuti (urut createdAt asc dari query)
  const historyByRequest = new Map<string, Map<string, QuotaHistoryRow[]>>();
  for (const row of histories) {
    if (!row.leaveRequestId || !row.leaveTypeId) continue;
    const perRequest = historyByRequest.get(row.leaveRequestId) ?? new Map<string, QuotaHistoryRow[]>();
    const rows = perRequest.get(row.leaveTypeId) ?? [];
    rows.push(row);
    perRequest.set(row.leaveTypeId, rows);
    historyByRequest.set(row.leaveRequestId, perRequest);
  }

  return requests.map((req) => {
    const { days, years, names } = collectDaysAndYears(req);
    const historyMap = historyByRequest.get(req.id) ?? new Map<string, QuotaHistoryRow[]>();

    // Jenis cuti yang hanya muncul di history (mis. pengajuan lama tanpa segments)
    for (const [leaveTypeId, rows] of historyMap) {
      if (days.has(leaveTypeId)) continue;
      days.set(leaveTypeId, 0);
      years.set(leaveTypeId, new Set<number>([req.startDate.getFullYear()]));
      const name = rows[0]?.leaveType?.name;
      if (name) names.set(leaveTypeId, name);
    }

    const perType: QuotaInfoPerType[] = [];
    let statusAffectsQuota = false;

    for (const [leaveTypeId, daysRequested] of days) {
      const rows = historyMap.get(leaveTypeId) ?? [];
      const { current, unlimited } = resolveCurrentRemaining(
        req.userId,
        leaveTypeId,
        years.get(leaveTypeId) ?? new Set<number>(),
        quotaMap
      );

      let previousRemaining: number | null = current;
      let remainingAfter: number | null = current;
      let usedByThisRequest = 0;

      // Sebagian baris history mewarisi baseline dari kuota tahunan generik — misalnya
      // previousQuota=12 / newQuota=10 untuk jenis cuti yang kuotanya hanya 2 hari.
      // Angka seperti itu mustahil secara data (melebihi total kuota jenisnya) dan membuat
      // rincian kuota menyesatkan, jadi baris tersebut DIABAIKAN di sini. Barisnya tetap
      // tersimpan sebagai audit trail (ditandai oleh script rekonsiliasi).
      const typeQuota = resolveTotalQuota(
        req.userId,
        leaveTypeId,
        years.get(leaveTypeId) ?? new Set<number>(),
        quotaMap
      );
      const usableRows =
        typeQuota.unlimited || !typeQuota.known
          ? rows
          : rows.filter((row) => row.previousQuota <= typeQuota.total && row.newQuota <= typeQuota.total);

      if (usableRows.length > 0) {
        // Sudah memotong kuota: previousQuota dari baris paling awal,
        // newQuota dari baris paling akhir, dan seluruh changeAmount dijumlahkan
        // (mis. potong lalu dikembalikan sebagian).
        statusAffectsQuota = true;
        previousRemaining = usableRows[0].previousQuota;
        remainingAfter = usableRows[usableRows.length - 1].newQuota;
        usedByThisRequest = -usableRows.reduce((sum, row) => sum + row.changeAmount, 0);
      } else if (rows.length > 0 && (req.status === LeaveStatus.APPROVED || req.status === LeaveStatus.DONE)) {
        // Semua baris history tidak valid: hitung mundur dari kuota live, bukan dari snapshot
        // legacy. Sisa sebelum pengajuan = sisa sekarang + hari yang dipotong pengajuan ini.
        statusAffectsQuota = true;
        usedByThisRequest = daysRequested;
        previousRemaining = current === null ? null : current + daysRequested;
        remainingAfter = current;
      }

      if (unlimited) {
        // Kuota tak terbatas (>= 999 hari): angka sisa tidak bermakna
        previousRemaining = null;
        remainingAfter = null;
      }

      perType.push({
        leaveTypeId,
        leaveTypeName: names.get(leaveTypeId) ?? 'Cuti',
        daysRequested,
        previousRemaining,
        usedByThisRequest,
        remainingAfter,
        currentRemaining: current,
      });
    }

    const quotaInfo: QuotaInfo = {
      perType,
      totalDaysRequested: perType.reduce((sum, item) => sum + item.daysRequested, 0),
      totalUsedByThisRequest: perType.reduce((sum, item) => sum + item.usedByThisRequest, 0),
      statusAffectsQuota,
    };

    return { ...req, quotaInfo };
  });
}

export async function getLeaveRequests(options: LeaveFilterOptions = {}) {
  const whereClause: Prisma.LeaveRequestWhereInput = {
    deletedAt: null,
  };

  if (options.userId) {
    whereClause.userId = options.userId;
  }

  if (options.status) {
    whereClause.status = options.status;
  }

  if (options.leaveTypeId) {
    whereClause.requestTypes = {
      some: {
        leaveTypeId: options.leaveTypeId,
      },
    };
  }

  if (options.startDate) {
    whereClause.startDate = { gte: new Date(options.startDate) };
  }

  if (options.endDate) {
    whereClause.endDate = { lte: new Date(options.endDate) };
  }

  if (options.month && options.year) {
    const startOfMonth = new Date(options.year, options.month - 1, 1);
    const endOfMonth = new Date(options.year, options.month, 0, 23, 59, 59);
    whereClause.startDate = { gte: startOfMonth };
    whereClause.endDate = { lte: endOfMonth };
  } else if (options.year) {
    const startOfYear = new Date(options.year, 0, 1);
    const endOfYear = new Date(options.year, 11, 31, 23, 59, 59);
    whereClause.startDate = { gte: startOfYear };
    whereClause.endDate = { lte: endOfYear };
  }

  if (options.searchUser) {
    whereClause.user = {
      name: { contains: options.searchUser, mode: 'insensitive' },
    };
  }

  const requests = await prisma.leaveRequest.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      requestTypes: {
        include: {
          leaveType: true,
        },
      },
      segments: {
        include: { leaveType: true },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return attachQuotaInfo(requests);
}

export async function getLeaveRequestById(id: string) {
  const request = await prisma.leaveRequest.findFirst({
    where: { id, deletedAt: null },
    include: {
      user: {
        select: {
          id: true,
          nip: true,
          workUnit: true,
          name: true,
          email: true,
          role: true,
          gender: true,
          quota: true,
        },
      },
      requestTypes: {
        include: {
          leaveType: true,
        },
      },
      segments: {
        include: { leaveType: true },
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!request) return null;

  const [withQuotaInfo] = await attachQuotaInfo([request]);
  return withQuotaInfo;
}

export async function getDashboardStats(userId?: string) {
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { quota: true },
    });

    const requests = await prisma.leaveRequest.findMany({
      where: { userId, deletedAt: null },
    });

    const totalQuota = user?.quota?.totalQuota ?? 12;
    const usedQuota = user?.quota?.usedQuota ?? 0;
    const remainingQuota = totalQuota - usedQuota;

    const pendingCount = requests.filter((r) => r.status === LeaveStatus.ON_PROGRESS).length;
    const approvedCount = requests.filter((r) => r.status === LeaveStatus.APPROVED).length;
    const rejectedCount = requests.filter((r) => r.status === LeaveStatus.REJECTED).length;
    const cancelledCount = requests.filter((r) => r.status === LeaveStatus.CANCELLED).length;

    return {
      userName: user?.name ?? 'User',
      totalQuota,
      usedQuota,
      remainingQuota,
      pendingCount,
      approvedCount,
      rejectedCount,
      cancelledCount,
      totalRequests: requests.length,
    };
  } else {
    // Admin dashboard stats
    const totalUsers = await prisma.user.count({ where: { deletedAt: null, role: 'USER' } });
    const totalRequests = await prisma.leaveRequest.count({ where: { deletedAt: null } });

    const pendingCount = await prisma.leaveRequest.count({
      where: { deletedAt: null, status: LeaveStatus.ON_PROGRESS },
    });
    const approvedCount = await prisma.leaveRequest.count({
      where: { deletedAt: null, status: LeaveStatus.APPROVED },
    });
    const rejectedCount = await prisma.leaveRequest.count({
      where: { deletedAt: null, status: LeaveStatus.REJECTED },
    });
    const cancelledCount = await prisma.leaveRequest.count({
      where: { deletedAt: null, status: LeaveStatus.CANCELLED },
    });

    return {
      totalUsers,
      totalRequests,
      pendingCount,
      approvedCount,
      rejectedCount,
      cancelledCount,
    };
  }
}
