import { prisma } from '@/lib/db';
import { QuotaHistoryType } from '@prisma/client';

export async function ensureUserLeaveQuotas(
  userId: string,
  year: number = new Date().getFullYear(),
  db: any = prisma
) {
  const leaveTypes = await db.leaveType.findMany();
  const existingQuotas = await db.userLeaveQuota.findMany({
    where: { userId, year },
  });

  const existingMap = new Map(existingQuotas.map((q: any) => [q.leaveTypeId, q]));

  for (const lt of leaveTypes) {
    if (!existingMap.has(lt.id)) {
      const defaultQuota = lt.defaultDays !== null && lt.defaultDays !== undefined ? lt.defaultDays : 999;
      await db.userLeaveQuota.create({
        data: {
          userId,
          leaveTypeId: lt.id,
          year,
          totalQuota: defaultQuota,
          usedQuota: 0,
          borrowedQuota: 0,
        },
      });
    }
  }
}

export async function getUserQuotas(userId: string, year: number = new Date().getFullYear()) {
  await ensureUserLeaveQuotas(userId, year);

  return prisma.userLeaveQuota.findMany({
    where: { userId, year },
    include: {
      leaveType: true,
    },
    orderBy: { leaveType: { name: 'asc' } },
  });
}

export async function getAllUserQuotas(year: number = new Date().getFullYear()) {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, email: true, role: true, gender: true },
    orderBy: { name: 'asc' },
  });

  for (const user of users) {
    await ensureUserLeaveQuotas(user.id, year);
  }

  const userQuotas = await prisma.userLeaveQuota.findMany({
    where: { year, user: { deletedAt: null } },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true, gender: true },
      },
      leaveType: true,
    },
    orderBy: [{ user: { name: 'asc' } }, { leaveType: { name: 'asc' } }],
  });

  return { users, userQuotas };
}

export async function resetAnnualQuotas(targetYear: number = new Date().getFullYear()) {
  const previousYear = targetYear - 1;

  const users = await prisma.user.findMany({ where: { deletedAt: null } });
  const cutiTahunanType = await prisma.leaveType.findFirst({
    where: { name: 'Cuti Tahunan' },
  });

  if (!cutiTahunanType) {
    throw new Error('Jenis Cuti Tahunan tidak ditemukan');
  }

  const results = [];

  for (const user of users) {
    // 1. Check if user has custom entitlement in previous year or existing record
    const prevAnnualQuota = await prisma.userLeaveQuota.findFirst({
      where: {
        userId: user.id,
        year: previousYear,
        leaveTypeId: cutiTahunanType.id,
      },
    });

    const userEntitlement = prevAnnualQuota ? prevAnnualQuota.totalQuota : 12;

    // 2. Check if user borrowed quota in previous year
    const prevPinjamQuota = await prisma.userLeaveQuota.findFirst({
      where: {
        userId: user.id,
        year: previousYear,
        leaveType: { name: 'Pinjam Cuti' },
      },
    });

    const borrowedDays = prevPinjamQuota ? prevPinjamQuota.usedQuota : 0;
    const newAnnualTotal = Math.max(0, userEntitlement - borrowedDays);

    // 3. Ensure target year entry exists
    await ensureUserLeaveQuotas(user.id, targetYear);

    // 4. Reset Annual Leave quota for target year
    const annualQuota = await prisma.userLeaveQuota.findFirst({
      where: {
        userId: user.id,
        year: targetYear,
        leaveTypeId: cutiTahunanType.id,
      },
    });

    if (annualQuota) {
      const prevRemaining = annualQuota.totalQuota - annualQuota.usedQuota;

      await prisma.userLeaveQuota.update({
        where: { id: annualQuota.id },
        data: {
          totalQuota: newAnnualTotal,
          usedQuota: 0,
          borrowedQuota: 0,
        },
      });

      // Also sync standard LeaveQuota model for backward compatibility
      await prisma.leaveQuota.upsert({
        where: { userId: user.id },
        create: { userId: user.id, totalQuota: newAnnualTotal, usedQuota: 0 },
        update: { totalQuota: newAnnualTotal, usedQuota: 0 },
      });

      // Log Quota History
      await prisma.leaveQuotaHistory.create({
        data: {
          userId: user.id,
          previousQuota: prevRemaining,
          changeAmount: newAnnualTotal - prevRemaining,
          newQuota: newAnnualTotal,
          type: QuotaHistoryType.ANNUAL_RESET,
          description: borrowedDays > 0
            ? `Auto-reset kuota tahunan ${targetYear}: ${userEntitlement} hari dikurangi ${borrowedDays} hari pinjam cuti tahun ${previousYear} = ${newAnnualTotal} hari`
            : `Auto-reset kuota cuti tahunan ${targetYear} menjadi ${newAnnualTotal} hari (Batas Jatah: ${userEntitlement} Hari)`,
        },
      });

      results.push({
        userId: user.id,
        name: user.name,
        userEntitlement,
        borrowedDays,
        newAnnualTotal,
      });
    }
  }

  return results;
}

export async function updateUserAnnualQuota(
  userId: string,
  year: number,
  newTotalQuota: number,
  leaveTypeId?: string
) {
  const leaveType = leaveTypeId
    ? await prisma.leaveType.findUnique({ where: { id: leaveTypeId } })
    : await prisma.leaveType.findFirst({ where: { name: 'Cuti Tahunan' } });

  if (!leaveType) {
    throw new Error('Jenis Cuti tidak ditemukan');
  }

  await ensureUserLeaveQuotas(userId, year);

  const quota = await prisma.userLeaveQuota.findFirst({
    where: { userId, year, leaveTypeId: leaveType.id },
  });

  if (!quota) {
    throw new Error(`Data kuota ${leaveType.name} user tidak ditemukan`);
  }

  const oldTotal = quota.totalQuota;
  const diff = newTotalQuota - oldTotal;

  const updated = await prisma.userLeaveQuota.update({
    where: { id: quota.id },
    data: { totalQuota: newTotalQuota },
  });

  // Sync standard LeaveQuota table for backward compatibility (annual only)
  if (leaveType.name === 'Cuti Tahunan') {
    await prisma.leaveQuota.upsert({
      where: { userId },
      create: { userId, totalQuota: newTotalQuota, usedQuota: quota.usedQuota },
      update: { totalQuota: newTotalQuota },
    });
  }

  const prevRemaining = oldTotal - quota.usedQuota;
  const newRemaining = newTotalQuota - quota.usedQuota;

  await prisma.leaveQuotaHistory.create({
    data: {
      userId,
      previousQuota: prevRemaining,
      changeAmount: diff,
      newQuota: newRemaining,
      type: QuotaHistoryType.ADMIN_MANUAL_ADJUSTMENT,
      description: `Perubahan kuota ${leaveType.name} oleh Admin dari ${oldTotal} menjadi ${newTotalQuota} Hari`,
    },
  });

  return updated;
}

export async function getUserQuota(userId: string) {
  const quota = await prisma.leaveQuota.findUnique({
    where: { userId },
  });

  if (!quota) {
    return {
      totalQuota: 12,
      usedQuota: 0,
      remainingQuota: 12,
    };
  }

  return {
    totalQuota: quota.totalQuota,
    usedQuota: quota.usedQuota,
    remainingQuota: quota.totalQuota - quota.usedQuota,
  };
}

export async function updateUserQuota(userId: string, newTotalQuota: number) {
  return updateUserAnnualQuota(userId, new Date().getFullYear(), newTotalQuota);
}

export async function getQuotaHistories(userId?: string) {
  return prisma.leaveQuotaHistory.findMany({
    where: userId ? { userId } : undefined,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      leaveRequest: {
        select: {
          id: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}
