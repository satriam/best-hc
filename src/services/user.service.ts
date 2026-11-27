import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { Prisma, QuotaHistoryType } from '@prisma/client';
import { CreateUserInput, UpdateUserInput } from '@/schemas/user.schema';
import { ensureUserLeaveQuotas } from '@/services/quota.service';
import { currentPeriodYear, normalizeRule } from '@/lib/quota-period';
import { isValidRosterPattern } from '@/lib/roster';

/**
 * Normalisasi setelan kerja. SHIFT wajib punya pola roster valid + tanggal mulai;
 * NON_SHIFT mengosongkan data roster.
 */
function resolveWorkSettings(
  input: { workType?: 'NON_SHIFT' | 'SHIFT'; rosterPattern?: string | null; rosterStartDate?: string | null },
  current?: { workType: 'NON_SHIFT' | 'SHIFT'; rosterPattern: string | null; rosterStartDate: Date | null }
): { workType: 'NON_SHIFT' | 'SHIFT'; rosterPattern: string | null; rosterStartDate: Date | null } | null {
  if (input.workType === undefined && input.rosterPattern === undefined && input.rosterStartDate === undefined) {
    return null;
  }
  const workType = input.workType ?? current?.workType ?? 'NON_SHIFT';
  if (workType === 'NON_SHIFT') return { workType, rosterPattern: null, rosterStartDate: null };

  const pattern =
    input.rosterPattern !== undefined
      ? input.rosterPattern?.trim().toUpperCase() || null
      : current?.rosterPattern ?? null;
  const start =
    input.rosterStartDate !== undefined
      ? input.rosterStartDate
        ? new Date(input.rosterStartDate)
        : null
      : current?.rosterStartDate ?? null;
  if (!isValidRosterPattern(pattern)) throw new Error('Karyawan shift wajib punya pola roster kerja');
  if (!start || isNaN(start.getTime())) throw new Error('Karyawan shift wajib punya tanggal mulai roster');
  return { workType, rosterPattern: pattern, rosterStartDate: start };
}

/** Date → 'YYYY-MM-DD' (tanggal tersimpan sebagai tengah malam UTC). */
function toDateOnly(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/**
 * Kolom `users` yang aman dikirim ke klien.
 *
 * `password` (hash bcrypt) SENGAJA tidak ada di sini: dipakai allow-list `select`,
 * bukan blacklist, supaya kolom sensitif baru di kemudian hari tidak otomatis ikut
 * terkirim lewat respons API.
 */
const publicUserSelect = {
  id: true,
  nip: true,
  position: true,
  workUnit: true,
  name: true,
  email: true,
  role: true,
  gender: true,
  joinDate: true,
  quotaResetMonth: true,
  quotaResetDay: true,
  workType: true,
  rosterPattern: true,
  rosterStartDate: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const satisfies Prisma.UserSelect;

/** Sama seperti `publicUserSelect` + relasi `quota` (dipakai `createUser`). */
const publicUserWithQuotaSelect = {
  ...publicUserSelect,
  quota: true,
} as const satisfies Prisma.UserSelect;

export async function getAllUsers() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    include: {
      quota: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return users.map((u) => ({
    id: u.id,
    nip: u.nip || '-',
    position: u.position || '-',
    workUnit: u.workUnit || '-',
    name: u.name,
    email: u.email,
    role: u.role,
    gender: u.gender,
    joinDate: toDateOnly(u.joinDate),
    quotaResetMonth: u.quotaResetMonth,
    quotaResetDay: u.quotaResetDay,
    workType: u.workType,
    rosterPattern: u.rosterPattern,
    rosterStartDate: toDateOnly(u.rosterStartDate),
    totalQuota: u.quota?.totalQuota ?? 12,
    usedQuota: u.quota?.usedQuota ?? 0,
    remainingQuota: (u.quota?.totalQuota ?? 12) - (u.quota?.usedQuota ?? 0),
    createdAt: u.createdAt,
  }));
}

export async function getUserById(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { quota: true },
  });

  if (!user) return null;

  return {
    id: user.id,
    nip: user.nip || '-',
    position: user.position || '-',
    workUnit: user.workUnit || '-',
    name: user.name,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    role: user.role,
    gender: user.gender,
    joinDate: toDateOnly(user.joinDate),
    quotaResetMonth: user.quotaResetMonth,
    quotaResetDay: user.quotaResetDay,
    workType: user.workType,
    rosterPattern: user.rosterPattern,
    rosterStartDate: toDateOnly(user.rosterStartDate),
    totalQuota: user.quota?.totalQuota ?? 12,
    usedQuota: user.quota?.usedQuota ?? 0,
    remainingQuota: (user.quota?.totalQuota ?? 12) - (user.quota?.usedQuota ?? 0),
    createdAt: user.createdAt,
  };
}

/**
 * Daftar user ringan untuk form SPKL (auto-isi NIK/nama/jabatan).
 *
 * SENGAJA hanya mengembalikan kolom yang dibutuhkan form: `id`, `name`, `nip`,
 * `position`, `workUnit`. Tidak ada `email`, `role`, apalagi `password`.
 */
export async function getUserOptions() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, nip: true, position: true, workUnit: true },
    orderBy: { name: 'asc' },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    nip: u.nip ?? null,
    position: u.position ?? null,
    workUnit: u.workUnit ?? null,
  }));
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    throw new Error('Email sudah terdaftar');
  }

  const hashedPassword = await bcrypt.hash(input.password, 10);
  const rule = normalizeRule({ resetMonth: input.quotaResetMonth, resetDay: input.quotaResetDay });
  const periodYear = currentPeriodYear(rule);
  const work = resolveWorkSettings(input) ?? { workType: 'NON_SHIFT' as const, rosterPattern: null, rosterStartDate: null };

  return prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        nip: input.nip || null,
        position: input.position?.trim() || null,
        workUnit: input.workUnit || null,
        name: input.name,
        email: input.email,
        password: hashedPassword,
        role: input.role,
        gender: input.gender,
        joinDate: input.joinDate ? new Date(input.joinDate) : null,
        quotaResetMonth: rule.resetMonth,
        quotaResetDay: rule.resetDay,
        lastQuotaResetYear: periodYear,
        ...work,
        quota: {
          create: {
            totalQuota: input.totalQuota,
            usedQuota: 0,
          },
        },
      },
      select: publicUserWithQuotaSelect,
    });

    await tx.leaveQuotaHistory.create({
      data: {
        userId: newUser.id,
        previousQuota: 0,
        changeAmount: input.totalQuota,
        newQuota: input.totalQuota,
        type: QuotaHistoryType.INITIAL_QUOTA,
        description: `Penetapan kuota awal oleh Admin (${input.totalQuota} Hari)`,
      },
    });

    await ensureUserLeaveQuotas(newUser.id, periodYear, tx);

    return newUser;
  });
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: { quota: true },
  });

  if (!user) throw new Error('User tidak ditemukan');

  if (input.email && input.email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new Error('Email sudah digunakan user lain');
  }

  const dataToUpdate: Prisma.UserUpdateInput = {};
  if (input.nip !== undefined) dataToUpdate.nip = input.nip || null;
  if (input.position !== undefined) dataToUpdate.position = input.position?.trim() || null;
  if (input.workUnit !== undefined) dataToUpdate.workUnit = input.workUnit || null;
  if (input.name) dataToUpdate.name = input.name;
  if (input.email) dataToUpdate.email = input.email;
  if (input.role) dataToUpdate.role = input.role;
  if (input.gender) dataToUpdate.gender = input.gender;
  if (input.password && input.password.trim().length > 0) {
    dataToUpdate.password = await bcrypt.hash(input.password, 10);
  }
  if (input.joinDate !== undefined) {
    dataToUpdate.joinDate = input.joinDate ? new Date(input.joinDate) : null;
  }
  const work = resolveWorkSettings(input, user);
  if (work) Object.assign(dataToUpdate, work);

  // Tanggal reset berubah → periode berjalan dihitung ulang dengan aturan baru dan
  // dianggap sudah di-reset, supaya cron tidak langsung me-reset di luar jadwal.
  const newRule = normalizeRule({
    resetMonth: input.quotaResetMonth ?? user.quotaResetMonth,
    resetDay: input.quotaResetDay ?? user.quotaResetDay,
  });
  const ruleChanged =
    newRule.resetMonth !== user.quotaResetMonth || newRule.resetDay !== user.quotaResetDay;
  if (ruleChanged) {
    dataToUpdate.quotaResetMonth = newRule.resetMonth;
    dataToUpdate.quotaResetDay = newRule.resetDay;
    dataToUpdate.lastQuotaResetYear = currentPeriodYear(newRule);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: dataToUpdate,
      select: publicUserSelect,
    });

    if (ruleChanged) {
      await ensureUserLeaveQuotas(id, currentPeriodYear(newRule), tx);
    }

    if (input.totalQuota !== undefined && user.quota) {
      const oldTotal = user.quota.totalQuota;
      const newTotal = input.totalQuota;
      const diff = newTotal - oldTotal;

      if (diff !== 0) {
        await tx.leaveQuota.update({
          where: { userId: id },
          data: { totalQuota: newTotal },
        });

        // Samakan jatah Cuti Tahunan periode berjalan (halaman Kuota Cuti membaca tabel ini).
        const periodYear = currentPeriodYear(newRule);
        await ensureUserLeaveQuotas(id, periodYear, tx);
        await tx.userLeaveQuota.updateMany({
          where: { userId: id, year: periodYear, leaveType: { name: 'Cuti Tahunan' } },
          data: { totalQuota: newTotal },
        });

        const oldRemaining = oldTotal - user.quota.usedQuota;
        const newRemaining = newTotal - user.quota.usedQuota;

        await tx.leaveQuotaHistory.create({
          data: {
            userId: id,
            previousQuota: oldRemaining,
            changeAmount: diff,
            newQuota: newRemaining,
            type: QuotaHistoryType.ADMIN_MANUAL_ADJUSTMENT,
            description: `Penyesuaian total kuota oleh admin (${diff > 0 ? '+' : ''}${diff} Hari)`,
          },
        });
      }
    }

    return updated;
  });
}

export async function deleteUser(id: string) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('User tidak ditemukan atau sudah dihapus');
  }

  return prisma.user.delete({
    where: { id },
    select: publicUserSelect,
  });
}
