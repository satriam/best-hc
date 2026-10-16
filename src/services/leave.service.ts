import { prisma } from '@/lib/db';
import { LeaveStatus, QuotaHistoryType, CalculationType } from '@prisma/client';
import { calculateLeaveDays } from '@/lib/calculation';
import { getHolidayDatesSet } from '@/services/holiday.service';
import { CreateLeaveRequestInput } from '@/schemas/leave.schema';

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

export async function createLeaveRequest(userId: string, input: CreateLeaveRequestInput) {
  const user = await prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
  if (!user) {
    throw new Error('Sesi pengguna telah kadaluarsa. Silakan keluar (logout) dan login kembali.');
  }

  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);

  // 1. Fetch selected leave types
  const leaveTypes = await prisma.leaveType.findMany({
    where: { id: { in: input.leaveTypeIds } },
  });

  if (leaveTypes.length === 0) {
    throw new Error('Jenis cuti yang dipilih tidak valid');
  }

  // 2. Determine calculation modes
  const holidayDatesSet = await getHolidayDatesSet();
  const calcTypes = leaveTypes.map((t) => t.calculationType);
  const totalDays = calculateLeaveDays(startDate, endDate, calcTypes, holidayDatesSet);

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

  // 3. Status ON_PROGRESS (Quota does NOT decrease yet)
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
        create: input.leaveTypeIds.map((ltId) => ({ leaveTypeId: ltId })),
      },
    },
    include: {
      requestTypes: {
        include: {
          leaveType: true,
        },
      },
    },
  });
}

export async function updateLeaveRequest(
  requestId: string,
  userId: string,
  isAdmin: boolean,
  input: Partial<CreateLeaveRequestInput>
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.leaveRequest.findUnique({
      where: { id: requestId },
      include: {
        user: { include: { quota: true } },
        requestTypes: { include: { leaveType: true } },
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

    const leaveTypeIds = input.leaveTypeIds || existing.requestTypes.map((r) => r.leaveTypeId);
    const leaveTypes = await tx.leaveType.findMany({
      where: { id: { in: leaveTypeIds } },
    });

    const startDate = input.startDate ? new Date(input.startDate) : existing.startDate;
    const endDate = input.endDate ? new Date(input.endDate) : existing.endDate;

    const calcTypes = leaveTypes.map((t) => t.calculationType);
    const holidayDatesSet = await getHolidayDatesSet();
    const newTotalDays = calculateLeaveDays(startDate, endDate, calcTypes, holidayDatesSet);

    if (newTotalDays <= 0) {
      throw new Error('Jumlah hari cuti tidak valid');
    }

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

    // Update pivot leave types if provided
    if (input.leaveTypeIds) {
      await tx.leaveRequestType.deleteMany({
        where: { leaveRequestId: requestId },
      });

      await tx.leaveRequestType.createMany({
        data: input.leaveTypeIds.map((ltId) => ({
          leaveRequestId: requestId,
          leaveTypeId: ltId,
        })),
      });
    }

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
