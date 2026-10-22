import { prisma } from '@/lib/db';
import { Prisma, QuotaHistoryType } from '@prisma/client';
import { ApiError } from '@/lib/api-error';
import type { QuotaAdjustMode, QuotaSyncMode, QuotaSyncRow } from '@/schemas/quota.schema';

type Client = Prisma.TransactionClient | typeof prisma;

/** Nama jenis cuti yang punya cermin di tabel legacy `leave_quotas`. */
const ANNUAL_LEAVE_NAME = 'Cuti Tahunan';

export interface QuotaValues {
  totalQuota: number;
  usedQuota: number;
}

function toRemaining(values: QuotaValues): number {
  return values.totalQuota - values.usedQuota;
}

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

  const quotas = await prisma.userLeaveQuota.findMany({
    where: { userId, year },
    include: {
      leaveType: true,
    },
    orderBy: { leaveType: { name: 'asc' } },
  });

  return quotas.map((quota) => ({
    ...quota,
    remainingQuota: quota.totalQuota - quota.usedQuota,
  }));
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

  return {
    users,
    userQuotas: userQuotas.map((quota) => ({
      ...quota,
      remainingQuota: quota.totalQuota - quota.usedQuota,
    })),
  };
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
          leaveTypeId: cutiTahunanType.id,
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

const MODE_LABEL: Record<QuotaAdjustMode, string> = {
  TOTAL: 'JATAH',
  USED: 'TERPAKAI',
  REMAINING: 'SISA',
};

async function resolveLeaveType(db: Client, leaveTypeId?: string) {
  const leaveType = leaveTypeId
    ? await db.leaveType.findUnique({ where: { id: leaveTypeId } })
    : await db.leaveType.findFirst({ where: { name: ANNUAL_LEAVE_NAME } });

  if (!leaveType) {
    throw new ApiError(
      leaveTypeId
        ? 'Jenis Cuti tidak ditemukan'
        : `Jenis cuti ${ANNUAL_LEAVE_NAME} tidak ditemukan`,
      404
    );
  }

  return leaveType;
}

/**
 * Hitung `totalQuota`/`usedQuota` baru berdasarkan mode input admin.
 * Melempar ApiError 422 bila nilai melanggar jatah (bukan error bentuk body).
 */
export function applyQuotaMode(
  mode: QuotaAdjustMode,
  value: number,
  current: QuotaValues
): QuotaValues {
  if (!Number.isInteger(value) || value < 0) {
    throw new ApiError(`Nilai kuota harus bilangan bulat >= 0 (diterima: ${value})`, 422);
  }

  switch (mode) {
    case 'TOTAL':
      // Jatah diubah, terpakai dibiarkan (perilaku lama).
      return { totalQuota: value, usedQuota: current.usedQuota };

    case 'USED':
      if (value > current.totalQuota) {
        throw new ApiError(
          `Terpakai ${value} hari melebihi jatah ${current.totalQuota} hari — ubah jatah dulu atau isi mode sisa.`,
          422
        );
      }
      return { totalQuota: current.totalQuota, usedQuota: value };

    case 'REMAINING':
      if (value > current.totalQuota) {
        throw new ApiError(
          `Sisa ${value} hari melebihi jatah ${current.totalQuota} hari — sisa tidak boleh melebihi jatah.`,
          422
        );
      }
      return { totalQuota: current.totalQuota, usedQuota: current.totalQuota - value };

    default:
      throw new ApiError(`Mode kuota tidak dikenal: ${String(mode)}`, 422);
  }
}

/**
 * Terapkan satu perubahan kuota di dalam transaksi:
 * update `UserLeaveQuota` + sinkron `LeaveQuota` legacy (khusus Cuti Tahunan)
 * + catat `LeaveQuotaHistory` (angka SISA, `leaveTypeId` selalu terisi).
 */
async function writeQuotaChange(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    leaveType: { id: string; name: string };
    quotaId: string;
    before: QuotaValues;
    after: QuotaValues;
    description: string;
  }
) {
  const { userId, leaveType, quotaId, before, after, description } = params;

  const updated = await tx.userLeaveQuota.update({
    where: { id: quotaId },
    data: { totalQuota: after.totalQuota, usedQuota: after.usedQuota },
  });

  if (leaveType.name === ANNUAL_LEAVE_NAME) {
    await tx.leaveQuota.upsert({
      where: { userId },
      create: { userId, totalQuota: after.totalQuota, usedQuota: after.usedQuota },
      update: { totalQuota: after.totalQuota, usedQuota: after.usedQuota },
    });
  }

  const previousRemaining = toRemaining(before);
  const newRemaining = toRemaining(after);

  await tx.leaveQuotaHistory.create({
    data: {
      userId,
      leaveTypeId: leaveType.id,
      previousQuota: previousRemaining,
      changeAmount: newRemaining - previousRemaining,
      newQuota: newRemaining,
      type: QuotaHistoryType.ADMIN_MANUAL_ADJUSTMENT,
      description,
    },
  });

  return { updated, previousRemaining, newRemaining };
}

/**
 * Ubah kuota cuti user berdasarkan mode input admin
 * (`TOTAL` = jatah, `USED` = terpakai, `REMAINING` = sisa).
 */
export async function updateUserQuotaByMode(
  userId: string,
  input: { mode: QuotaAdjustMode; value: number; year?: number; leaveTypeId?: string }
) {
  const year = input.year ?? new Date().getFullYear();

  return prisma.$transaction(async (tx) => {
    const leaveType = await resolveLeaveType(tx, input.leaveTypeId);

    await ensureUserLeaveQuotas(userId, year, tx);

    const quota = await tx.userLeaveQuota.findFirst({
      where: { userId, year, leaveTypeId: leaveType.id },
    });

    if (!quota) {
      throw new ApiError(`Data kuota ${leaveType.name} user tidak ditemukan`, 404);
    }

    const before: QuotaValues = { totalQuota: quota.totalQuota, usedQuota: quota.usedQuota };
    const after = applyQuotaMode(input.mode, input.value, before);

    const description =
      `Sinkronisasi kuota ${leaveType.name}: admin isi ${MODE_LABEL[input.mode]} ${input.value} hari ` +
      `(jatah ${before.totalQuota} → ${after.totalQuota}, terpakai ${before.usedQuota} → ${after.usedQuota}, ` +
      `sisa ${toRemaining(after)} hari)`;

    const { updated, previousRemaining, newRemaining } = await writeQuotaChange(tx, {
      userId,
      leaveType,
      quotaId: quota.id,
      before,
      after,
      description,
    });

    return {
      ...updated,
      leaveTypeName: leaveType.name,
      remainingQuota: newRemaining,
      previousQuota: previousRemaining,
    };
  });
}

/**
 * Wrapper backward-compatible: perilaku lama (isi JATAH) tetap jalan.
 */
export async function updateUserAnnualQuota(
  userId: string,
  year: number,
  newTotalQuota: number,
  leaveTypeId?: string
) {
  return updateUserQuotaByMode(userId, {
    mode: 'TOTAL',
    value: newTotalQuota,
    year,
    leaveTypeId,
  });
}

export interface QuotaSyncRowResult {
  userId: string;
  userEmail: string;
  leaveTypeId: string;
  leaveTypeName: string;
  before: QuotaValues & { remainingQuota: number };
  after: QuotaValues & { remainingQuota: number };
}

export interface QuotaSyncSkippedRow extends QuotaSyncRowResult {
  reason: string;
}

export interface QuotaSyncRowError {
  row: number;
  message: string;
}

/**
 * Sinkronisasi massal kuota cuti (all-or-nothing).
 *
 * Kalau ada satu saja baris tidak valid, seluruh permintaan ditolak (422) dan
 * tidak ada perubahan yang ditulis — aman untuk import data lama.
 * Baris yang nilainya sama dengan kondisi sekarang dilewati (tidak menulis
 * history ganda), sehingga operasi ini idempoten.
 */
export async function syncUserQuotasBulk(input: {
  mode: QuotaSyncMode;
  year?: number;
  rows: QuotaSyncRow[];
}) {
  const year = input.year ?? new Date().getFullYear();

  return prisma.$transaction(async (tx) => {
    const [users, leaveTypes] = await Promise.all([
      tx.user.findMany({
        where: { deletedAt: null },
        select: { id: true, email: true },
      }),
      tx.leaveType.findMany({ select: { id: true, name: true } }),
    ]);

    const userById = new Map(users.map((user) => [user.id, user]));
    const userByEmail = new Map(
      users.map((user) => [user.email.trim().toLowerCase(), user])
    );
    const typeById = new Map(leaveTypes.map((type) => [type.id, type]));
    const typeByName = new Map(
      leaveTypes.map((type) => [type.name.trim().toLowerCase(), type])
    );

    const errors: QuotaSyncRowError[] = [];
    const resolved: {
      row: number;
      user: { id: string; email: string };
      leaveType: { id: string; name: string };
      value: number;
    }[] = [];

    input.rows.forEach((row, index) => {
      const rowNo = index + 1;

      const user = row.userId
        ? userById.get(row.userId)
        : row.userEmail
          ? userByEmail.get(row.userEmail.trim().toLowerCase())
          : undefined;

      if (!user) {
        errors.push({
          row: rowNo,
          message: `user ${row.userId ?? row.userEmail ?? '-'} tidak ditemukan`,
        });
        return;
      }

      const leaveType = row.leaveTypeId
        ? typeById.get(row.leaveTypeId)
        : row.leaveTypeName
          ? typeByName.get(row.leaveTypeName.trim().toLowerCase())
          : undefined;

      if (!leaveType) {
        errors.push({
          row: rowNo,
          message: `jenis cuti ${row.leaveTypeId ?? row.leaveTypeName ?? '-'} tidak ditemukan`,
        });
        return;
      }

      if (!Number.isInteger(row.value) || row.value < 0) {
        errors.push({
          row: rowNo,
          message: `nilai ${row.value} harus bilangan bulat >= 0`,
        });
        return;
      }

      resolved.push({ row: rowNo, user, leaveType, value: row.value });
    });

    const userIds = Array.from(new Set(resolved.map((item) => item.user.id)));
    const leaveTypeIds = Array.from(new Set(resolved.map((item) => item.leaveType.id)));

    for (const uid of userIds) {
      await ensureUserLeaveQuotas(uid, year, tx);
    }

    const quotas = await tx.userLeaveQuota.findMany({
      where: { year, userId: { in: userIds }, leaveTypeId: { in: leaveTypeIds } },
    });
    const quotaMap = new Map(
      quotas.map((quota) => [`${quota.userId}|${quota.leaveTypeId}`, quota])
    );

    // Validasi seluruh baris dulu — belum ada satu pun perubahan ditulis.
    for (const item of resolved) {
      const quota = quotaMap.get(`${item.user.id}|${item.leaveType.id}`);

      if (!quota) {
        errors.push({
          row: item.row,
          message: `data kuota ${item.leaveType.name} user ${item.user.email} tahun ${year} tidak ditemukan`,
        });
        continue;
      }

      try {
        applyQuotaMode(input.mode, item.value, {
          totalQuota: quota.totalQuota,
          usedQuota: quota.usedQuota,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          errors.push({ row: item.row, message: error.message });
        } else {
          throw error;
        }
      }
    }

    if (errors.length > 0) {
      throw new ApiError(
        `Sinkronisasi dibatalkan: ${errors.length} baris tidak valid, tidak ada perubahan yang diterapkan.`,
        422,
        errors
      );
    }

    const state = new Map<string, QuotaValues>(
      quotas.map((quota) => [
        `${quota.userId}|${quota.leaveTypeId}`,
        { totalQuota: quota.totalQuota, usedQuota: quota.usedQuota },
      ])
    );

    const applied: QuotaSyncRowResult[] = [];
    const skipped: QuotaSyncSkippedRow[] = [];

    for (const item of resolved) {
      const key = `${item.user.id}|${item.leaveType.id}`;
      const current = state.get(key)!;
      const after = applyQuotaMode(input.mode, item.value, current);

      const result: QuotaSyncRowResult = {
        userId: item.user.id,
        userEmail: item.user.email,
        leaveTypeId: item.leaveType.id,
        leaveTypeName: item.leaveType.name,
        before: { ...current, remainingQuota: toRemaining(current) },
        after: { ...after, remainingQuota: toRemaining(after) },
      };

      if (
        current.totalQuota === after.totalQuota &&
        current.usedQuota === after.usedQuota
      ) {
        skipped.push({ ...result, reason: 'nilai sudah sama — tidak ada perubahan' });
        continue;
      }

      const description =
        `Sinkronisasi massal: isi ${MODE_LABEL[input.mode]} ${item.value} hari untuk ${item.leaveType.name} ` +
        `(jatah ${after.totalQuota} → terpakai ${after.usedQuota}, sisa ${toRemaining(after)} hari)`;

      await writeQuotaChange(tx, {
        userId: item.user.id,
        leaveType: item.leaveType,
        quotaId: quotaMap.get(key)!.id,
        before: current,
        after,
        description,
      });

      state.set(key, after);
      applied.push(result);
    }

    return {
      year,
      mode: input.mode,
      applied: applied.length,
      skipped: skipped.length,
      rows: applied,
      skippedRows: skipped,
    };
  });
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
