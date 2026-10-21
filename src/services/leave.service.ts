import { prisma } from '@/lib/db';
import { LeaveStatus, QuotaHistoryType, CalculationType } from '@prisma/client';
import { calculateLeaveDays } from '@/lib/calculation';
import { getHolidayDatesSet } from '@/services/holiday.service';
import { CreateLeaveRequestPayload, formatDateId } from '@/schemas/leave.schema';

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

    if (totalDays <= 0) {
      throw new Error(
        `Rentang ${formatDateId(segment.startDate)} - ${formatDateId(segment.endDate)} (${leaveType.name}) tidak mengandung hari cuti yang dapat dihitung. Periksa kembali tanggal dan jenis cutinya.`
      );
    }

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

  // Pivot jenis cuti (unik) — tetap diisi demi kompatibilitas list/filter lama
  const requestTypeIds = isLegacy
    ? unique(input.leaveTypeIds ?? segmentTypeIds)
    : segmentTypeIds;

  // Check for overlapping active or completed leave requests for this user (ON_PROGRESS, APPROVED, or DONE)
  const overlappingRequest = await prisma.leaveRequest.findFirst({
    where: {
      userId,
      status: { in: [LeaveStatus.ON_PROGRESS, LeaveStatus.APPROVED, LeaveStatus.DONE] },
      deletedAt: null,
      AND: [
        { startDate: { lte: endDate } },
        { endDate: { gte: startDate } },
      ],
    },
    include: {
      requestTypes: {
        include: {
          leaveType: true,
        },
      },
    },
  });

  if (overlappingRequest) {
    const typesName = overlappingRequest.requestTypes.map((rt) => rt.leaveType.name).join(', ');
    const formattedStart = overlappingRequest.startDate.toISOString().split('T')[0];
    const formattedEnd = overlappingRequest.endDate.toISOString().split('T')[0];

    throw new Error(
      `Anda sudah memiliki pengajuan/riwayat cuti (${typesName}) pada rentang tanggal ${formattedStart} s/d ${formattedEnd}. Silakan pilih tanggal lain.`
    );
  }

  // Check remaining quota for CUTI type requests
  const isCutiType = leaveTypes.some((t) => t.category === 'CUTI' || t.name === 'Cuti Tahunan');
  if (isCutiType) {
    const userQuota = await prisma.leaveQuota.findUnique({ where: { userId } });
    const remainingQuota = userQuota ? userQuota.totalQuota - userQuota.usedQuota : 12;
    if (totalDays > remainingQuota) {
      throw new Error(
        `Sisa kuota cuti Anda tidak mencukupi (Sisa Kuota: ${remainingQuota} Hari, Pengajuan: ${totalDays} Hari).`
      );
    }
  }

  // Check remaining per-leave-type quota (finite quotas only)
  const requestYear = startDate.getFullYear();
  for (const lt of leaveTypes) {
    const typeQuota = await prisma.userLeaveQuota.findFirst({
      where: { userId, leaveTypeId: lt.id, year: requestYear },
    });
    if (typeQuota && typeQuota.totalQuota < 999) {
      const remaining = typeQuota.totalQuota - typeQuota.usedQuota;
      if (totalDays > remaining) {
        throw new Error(
          `Sisa kuota ${lt.name} tidak mencukupi (Sisa: ${remaining} Hari, Pengajuan: ${totalDays} Hari).`
        );
      }
    }
  }

  // 4. Simpan pengajuan + segment (nested create) + pivot jenis cuti
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

    const requestTypeIds = hasSegmentsInput
      ? segmentTypeIds
      : input.leaveTypeIds?.length
        ? unique(input.leaveTypeIds)
        : segmentTypeIds;

    // Business Logic for APPROVED request update (Handling Difference in Days)
    if (existing.status === LeaveStatus.APPROVED) {
      const oldDays = existing.totalDays;
      const diff = newTotalDays - oldDays;

      if (diff !== 0 && existing.user.quota) {
        const quota = existing.user.quota;
        const currentRemaining = quota.totalQuota - quota.usedQuota;

        if (diff > 0) {
          // Days increased -> require more quota
          if (diff > currentRemaining) {
            throw new Error(
              `Sisa kuota tidak mencukupi untuk penambahan hari (${diff} hari dibutuhkan, sisa ${currentRemaining} hari)`
            );
          }

          // Deduct quota
          await tx.leaveQuota.update({
            where: { userId: existing.userId },
            data: { usedQuota: quota.usedQuota + diff },
          });

          await tx.leaveQuotaHistory.create({
            data: {
              userId: existing.userId,
              leaveRequestId: existing.id,
              previousQuota: currentRemaining,
              changeAmount: -diff,
              newQuota: currentRemaining - diff,
              type: QuotaHistoryType.LEAVE_DAYS_UPDATED,
              description: `Perubahan tanggal pengajuan cuti disetujui (bertambah ${diff} hari)`,
            },
          });
        } else {
          // Days decreased -> refund quota
          const refund = Math.abs(diff);

          await tx.leaveQuota.update({
            where: { userId: existing.userId },
            data: { usedQuota: quota.usedQuota - refund },
          });

          await tx.leaveQuotaHistory.create({
            data: {
              userId: existing.userId,
              leaveRequestId: existing.id,
              previousQuota: currentRemaining,
              changeAmount: refund,
              newQuota: currentRemaining + refund,
              type: QuotaHistoryType.LEAVE_DAYS_UPDATED,
              description: `Perubahan tanggal pengajuan cuti disetujui (berkurang ${refund} hari)`,
            },
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
    const days = request.totalDays;
    const userQuota = request.user.quota;

    if (!userQuota) {
      throw new Error('Data kuota user tidak ditemukan');
    }

    const currentRemaining = userQuota.totalQuota - userQuota.usedQuota;
    const leaveTypeNames = request.requestTypes.map((rt) => rt.leaveType.name).join(', ');

    // 1. Transition: ON_PROGRESS / REJECTED / CANCELLED -> (APPROVED or DONE)
    if (
      previousStatus !== LeaveStatus.APPROVED &&
      previousStatus !== LeaveStatus.DONE &&
      (newStatus === LeaveStatus.APPROVED || newStatus === LeaveStatus.DONE)
    ) {
      if (days > currentRemaining) {
        throw new Error(
          `Kuota cuti user tidak mencukupi (Sisa: ${currentRemaining} Hari, Pengajuan: ${days} Hari)`
        );
      }

      // Deduct Quota
      await tx.leaveQuota.update({
        where: { userId },
        data: { usedQuota: userQuota.usedQuota + days },
      });

      // Sync per-leave-type UserLeaveQuota record
      const requestYear = request.startDate.getFullYear();
      for (const rt of request.requestTypes) {
        await tx.userLeaveQuota.updateMany({
          where: { userId, leaveTypeId: rt.leaveTypeId, year: requestYear },
          data: { usedQuota: { increment: days } },
        });
      }

      // Record History
      await tx.leaveQuotaHistory.create({
        data: {
          userId,
          leaveRequestId: request.id,
          previousQuota: currentRemaining,
          changeAmount: -days,
          newQuota: currentRemaining - days,
          type: QuotaHistoryType.LEAVE_APPROVED,
          description: `Pengajuan cuti disetujui / diselesaikan (${leaveTypeNames}: ${days} Hari)`,
        },
      });
    }
    // 2. Transition: (APPROVED or DONE) -> CANCELLED or REJECTED (Refund Quota)
    else if (
      (previousStatus === LeaveStatus.APPROVED || previousStatus === LeaveStatus.DONE) &&
      newStatus !== LeaveStatus.APPROVED &&
      newStatus !== LeaveStatus.DONE
    ) {
      await tx.leaveQuota.update({
        where: { userId },
        data: { usedQuota: userQuota.usedQuota - days },
      });

      // Sync per-leave-type UserLeaveQuota record
      const requestYear = request.startDate.getFullYear();
      for (const rt of request.requestTypes) {
        await tx.userLeaveQuota.updateMany({
          where: { userId, leaveTypeId: rt.leaveTypeId, year: requestYear },
          data: { usedQuota: { decrement: days } },
        });
      }

      const historyType =
        newStatus === LeaveStatus.CANCELLED
          ? QuotaHistoryType.LEAVE_CANCELLED
          : QuotaHistoryType.LEAVE_REJECTED_AFTER_APPROVAL;

      const desc =
        newStatus === LeaveStatus.CANCELLED
          ? `Pembatalan pengajuan cuti (+${days} Hari)`
          : `Penolakan pengajuan cuti (+${days} Hari)`;

      await tx.leaveQuotaHistory.create({
        data: {
          userId,
          leaveRequestId: request.id,
          previousQuota: currentRemaining,
          changeAmount: days,
          newQuota: currentRemaining + days,
          type: historyType,
          description: desc,
        },
      });
    }

    // Update Leave Request status
    return tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus as any,
        adminNote: adminNote !== undefined ? adminNote : request.adminNote,
      },
      include: {
        requestTypes: { include: { leaveType: true } },
      },
    });
  });
}

export async function deleteLeaveRequest(requestId: string, userId: string, isAdmin: boolean) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findUnique({
      where: { id: requestId },
      include: { user: { include: { quota: true } } },
    });

    if (!request || request.deletedAt) {
      throw new Error('Pengajuan cuti tidak ditemukan');
    }

    if (!isAdmin && request.userId !== userId) {
      throw new Error('Anda tidak berhak menghapus pengajuan ini');
    }

    // If deleting an APPROVED or DONE request, refund quota first
    if ((request.status === LeaveStatus.APPROVED || request.status === LeaveStatus.DONE) && request.user.quota) {
      const days = request.totalDays;
      const currentRemaining = request.user.quota.totalQuota - request.user.quota.usedQuota;

      await tx.leaveQuota.update({
        where: { userId: request.userId },
        data: { usedQuota: request.user.quota.usedQuota - days },
      });

      const requestYear = request.startDate.getFullYear();
      const requestTypes = await tx.leaveRequestType.findMany({ where: { leaveRequestId: request.id } });
      for (const rt of requestTypes) {
        await tx.userLeaveQuota.updateMany({
          where: { userId: request.userId, leaveTypeId: rt.leaveTypeId, year: requestYear },
          data: { usedQuota: { decrement: days } },
        });
      }

      await tx.leaveQuotaHistory.create({
        data: {
          userId: request.userId,
          leaveRequestId: null, // Keep history even if request deleted!
          previousQuota: currentRemaining,
          changeAmount: days,
          newQuota: currentRemaining + days,
          type: QuotaHistoryType.LEAVE_CANCELLED,
          description: `Pengembalian kuota karena pengajuan cuti disetujui/selesai dihapus (+${days} Hari)`,
        },
      });
    }

    return tx.leaveRequest.update({
      where: { id: requestId },
      data: { deletedAt: new Date() },
    });
  });
}

export async function getLeaveRequests(options: LeaveFilterOptions = {}) {
  const whereClause: any = {
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

  return prisma.leaveRequest.findMany({
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
}

export async function getLeaveRequestById(id: string) {
  return prisma.leaveRequest.findFirst({
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
