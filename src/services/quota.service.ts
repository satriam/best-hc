import { prisma } from '@/lib/db';
import { LeaveStatus, Prisma, QuotaHistoryType } from '@prisma/client';
import { currentPeriodYear, normalizeRule, periodRange, QuotaResetRule } from '@/lib/quota-period';
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

/** Kuota >= nilai ini dianggap tanpa batas (sama dengan default baris tanpa `defaultDays`). */
const UNLIMITED_QUOTA = 999;

/**
 * Jatah Cuti Tahunan user untuk periode `year` bila barisnya belum ada:
 * jatah periode sebelumnya (sebelum potongan pinjam cuti), lalu kuota lama
 * `leave_quotas`, lalu 12 hari. Bukan 999: Cuti Tahunan selalu terbatas.
 */
async function defaultAnnualEntitlement(db: Client, userId: string, annualTypeId: string, year: number) {
  const prev = await db.userLeaveQuota.findFirst({
    where: { userId, leaveTypeId: annualTypeId, year: year - 1 },
  });
  if (prev && prev.totalQuota < UNLIMITED_QUOTA) return prev.totalQuota + (prev.borrowedQuota ?? 0);
  const generic = await db.leaveQuota.findUnique({ where: { userId } });
  if (generic && generic.totalQuota < UNLIMITED_QUOTA) return generic.totalQuota;
  return 12;
}

export async function ensureUserLeaveQuotas(
  userId: string,
  year: number = new Date().getFullYear(),
  db: any = prisma
) {
  // Dua query independen → satu wave, bukan dua round-trip berurutan.
  const [leaveTypes, existingQuotas] = await Promise.all([
    db.leaveType.findMany(),
    db.userLeaveQuota.findMany({ where: { userId, year } }),
  ]);

  const existingMap = new Map(existingQuotas.map((q: any) => [q.leaveTypeId, q]));

  const types = leaveTypes as Array<{ id: string; name: string; defaultDays: number | null }>;
  const annualType = types.find((lt) => lt.name === ANNUAL_LEAVE_NAME);
  const annualDefault =
    annualType && !existingMap.has(annualType.id) && annualType.defaultDays == null
      ? await defaultAnnualEntitlement(db, userId, annualType.id, year)
      : null;

  const missing = types
    .filter((lt) => !existingMap.has(lt.id))
    .map((lt) => ({
      userId,
      leaveTypeId: lt.id,
      year,
      totalQuota:
        lt.defaultDays !== null && lt.defaultDays !== undefined
          ? lt.defaultDays
          : lt.id === annualType?.id && annualDefault !== null
            ? annualDefault
            : UNLIMITED_QUOTA,
      usedQuota: 0,
      borrowedQuota: 0,
    }));

  // Satu INSERT untuk semua jenis cuti yang belum punya baris (bukan N INSERT berurutan).
  if (missing.length > 0) {
    await db.userLeaveQuota.createMany({ data: missing });
  }
}

export async function getUserQuotas(userId: string, periodYear?: number) {
  const year = periodYear ?? currentPeriodYear(await getQuotaRule(userId));
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
  // Query user, jenis cuti, dan baris kuota tahun ini dijalankan paralel (1 wave).
  const [users, leaveTypes, existingQuotas] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, email: true, role: true, gender: true },
      orderBy: { name: 'asc' },
    }),
    prisma.leaveType.findMany(),
    prisma.userLeaveQuota.findMany({
      where: { year, user: { deletedAt: null } },
      select: { userId: true, leaveTypeId: true },
    }),
  ]);

  // Pastikan setiap user punya baris kuota untuk semua jenis cuti — satu INSERT massal,
  // bukan 2 query per user seperti sebelumnya.
  const existingKeys = new Set(existingQuotas.map((q) => `${q.userId}|${q.leaveTypeId}`));
  const missing = users.flatMap((user) =>
    leaveTypes
      .filter((lt) => !existingKeys.has(`${user.id}|${lt.id}`))
      .map((lt) => ({
        userId: user.id,
        leaveTypeId: lt.id,
        year,
        totalQuota: lt.defaultDays !== null && lt.defaultDays !== undefined ? lt.defaultDays : 999,
        usedQuota: 0,
        borrowedQuota: 0,
      }))
  );

  if (missing.length > 0) {
    await prisma.userLeaveQuota.createMany({ data: missing });
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

/** Aturan periode kuota milik user (tanggal reset). */
export async function getQuotaRule(userId: string, db: Client = prisma): Promise<QuotaResetRule> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { quotaResetMonth: true, quotaResetDay: true },
  });
  return normalizeRule(user ? { resetMonth: user.quotaResetMonth, resetDay: user.quotaResetDay } : null);
}

/**
 * Hari Cuti Tahunan yang sudah disetujui (APPROVED/DONE) di periode `periodYear` user.
 * Segment sudah dipecah per periode saat disimpan, jadi cukup dilihat tanggal mulainya.
 */
async function approvedAnnualDaysInPeriod(
  db: Client,
  userId: string,
  annualTypeId: string,
  periodYear: number,
  rule: QuotaResetRule
): Promise<number> {
  const { start, end } = periodRange(periodYear, rule);
  const result = await db.leaveRequestSegment.aggregate({
    _sum: { totalDays: true },
    where: {
      leaveTypeId: annualTypeId,
      startDate: { gte: start, lte: end },
      leaveRequest: {
        userId,
        deletedAt: null,
        status: { in: [LeaveStatus.APPROVED, LeaveStatus.DONE] },
      },
    },
  });
  return result._sum.totalDays ?? 0;
}

interface ResetUser {
  id: string;
  name: string;
  quotaResetMonth: number;
  quotaResetDay: number;
  lastQuotaResetYear: number | null;
}

/**
 * Reset kuota Cuti Tahunan satu user untuk periode `targetYear`.
 *
 * - Jatah = jatah periode sebelumnya, dikurangi Pinjam Cuti periode sebelumnya.
 * - Terpakai = DIHITUNG ULANG dari cuti yang sudah disetujui di periode itu
 *   (cuti yang disetujui sebelum reset tetap terhitung; reset dua kali aman).
 * - Sisa periode lama tidak dibawa (hangus).
 * - Tabel lama `leave_quotas` ikut disinkronkan hanya bila periode ini sedang berjalan.
 */
async function resetUserAnnualQuota(user: ResetUser, targetYear: number, annualTypeId: string) {
  const rule = normalizeRule({ resetMonth: user.quotaResetMonth, resetDay: user.quotaResetDay });
  const previousYear = targetYear - 1;

  return prisma.$transaction(async (tx) => {
    const [prevAnnualQuota, prevPinjamQuota] = await Promise.all([
      tx.userLeaveQuota.findFirst({
        where: { userId: user.id, year: previousYear, leaveTypeId: annualTypeId },
      }),
      tx.userLeaveQuota.findFirst({
        where: { userId: user.id, year: previousYear, leaveType: { name: 'Pinjam Cuti' } },
      }),
    ]);

    const userEntitlement =
      prevAnnualQuota && prevAnnualQuota.totalQuota < UNLIMITED_QUOTA
        ? prevAnnualQuota.totalQuota + prevAnnualQuota.borrowedQuota
        : await defaultAnnualEntitlement(tx, user.id, annualTypeId, targetYear);
    const borrowedDays = prevPinjamQuota ? prevPinjamQuota.usedQuota : 0;
    const newAnnualTotal = Math.max(0, userEntitlement - borrowedDays);

    await ensureUserLeaveQuotas(user.id, targetYear, tx);

    const annualQuota = await tx.userLeaveQuota.findFirst({
      where: { userId: user.id, year: targetYear, leaveTypeId: annualTypeId },
    });
    if (!annualQuota) return null;

    const usedDays = await approvedAnnualDaysInPeriod(tx, user.id, annualTypeId, targetYear, rule);
    const prevRemaining = annualQuota.totalQuota - annualQuota.usedQuota;
    const newRemaining = newAnnualTotal - usedDays;

    await tx.userLeaveQuota.update({
      where: { id: annualQuota.id },
      data: { totalQuota: newAnnualTotal, usedQuota: usedDays, borrowedQuota: borrowedDays },
    });

    if (targetYear === currentPeriodYear(rule)) {
      await tx.leaveQuota.upsert({
        where: { userId: user.id },
        create: { userId: user.id, totalQuota: newAnnualTotal, usedQuota: usedDays },
        update: { totalQuota: newAnnualTotal, usedQuota: usedDays },
      });
    }

    const { start, end } = periodRange(targetYear, rule);
    const periodLabel = `${formatDay(start)} – ${formatDay(end)}`;

    await tx.leaveQuotaHistory.create({
      data: {
        userId: user.id,
        leaveTypeId: annualTypeId,
        previousQuota: prevRemaining,
        changeAmount: newRemaining - prevRemaining,
        newQuota: newRemaining,
        type: QuotaHistoryType.ANNUAL_RESET,
        description:
          `Reset kuota cuti tahunan periode ${periodLabel}: jatah ${newAnnualTotal} hari` +
          (borrowedDays > 0 ? ` (${userEntitlement} dikurangi pinjam cuti ${borrowedDays} hari)` : '') +
          (usedDays > 0 ? `, sudah terpakai ${usedDays} hari dari cuti yang disetujui` : ''),
      },
    });

    if (user.lastQuotaResetYear === null || user.lastQuotaResetYear < targetYear) {
      await tx.user.update({ where: { id: user.id }, data: { lastQuotaResetYear: targetYear } });
    }

    return {
      userId: user.id,
      name: user.name,
      periodStart: start,
      periodEnd: end,
      userEntitlement,
      borrowedDays,
      usedDays,
      newAnnualTotal,
    };
  });
}

function formatDay(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

async function getAnnualTypeId() {
  const cutiTahunanType = await prisma.leaveType.findFirst({ where: { name: ANNUAL_LEAVE_NAME } });
  if (!cutiTahunanType) throw new Error('Jenis Cuti Tahunan tidak ditemukan');
  return cutiTahunanType.id;
}

const resetUserSelect = {
  id: true,
  name: true,
  quotaResetMonth: true,
  quotaResetDay: true,
  lastQuotaResetYear: true,
} as const;

/** Reset satu user untuk periode `targetYear` (dipakai admin per user & tes). */
export async function resetUserQuotaForPeriod(userId: string, targetYear: number) {
  const annualTypeId = await getAnnualTypeId();
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: resetUserSelect });
  if (!user) throw new Error('User tidak ditemukan');
  return resetUserAnnualQuota(user, targetYear, annualTypeId);
}

/** Reset manual oleh admin: semua user, periode `targetYear` (sesuai tanggal reset masing-masing). */
export async function resetAnnualQuotas(targetYear: number = new Date().getFullYear()) {
  const annualTypeId = await getAnnualTypeId();
  const users = await prisma.user.findMany({ where: { deletedAt: null }, select: resetUserSelect });

  const results = [];
  for (const user of users) {
    const result = await resetUserAnnualQuota(user, targetYear, annualTypeId);
    if (result) results.push(result);
  }
  return results;
}

/**
 * Reset otomatis (cron harian): user yang periode kuotanya sudah berganti
 * tapi belum di-reset. Idempoten — aman dijalankan berkali-kali, dan
 * menyusul sendiri bila cron sempat terlewat.
 */
export async function resetDueQuotas(now: Date = new Date()) {
  const annualTypeId = await getAnnualTypeId();
  const users = await prisma.user.findMany({ where: { deletedAt: null }, select: resetUserSelect });

  const results = [];
  for (const user of users) {
    const rule = normalizeRule({ resetMonth: user.quotaResetMonth, resetDay: user.quotaResetDay });
    const periodYear = currentPeriodYear(rule, now);
    if (user.lastQuotaResetYear !== null && user.lastQuotaResetYear >= periodYear) continue;
    const result = await resetUserAnnualQuota(user, periodYear, annualTypeId);
    if (result) results.push(result);
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
