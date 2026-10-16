import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { CreateUserInput, UpdateUserInput } from '@/schemas/user.schema';
import { QuotaHistoryType } from '@prisma/client';
import { ensureUserLeaveQuotas } from '@/services/quota.service';

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
    workUnit: u.workUnit || '-',
    name: u.name,
    email: u.email,
    role: u.role,
    gender: u.gender,
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
    workUnit: user.workUnit || '-',
    name: user.name,
    email: user.email,
    role: user.role,
    gender: user.gender,
    totalQuota: user.quota?.totalQuota ?? 12,
    usedQuota: user.quota?.usedQuota ?? 0,
    remainingQuota: (user.quota?.totalQuota ?? 12) - (user.quota?.usedQuota ?? 0),
    createdAt: user.createdAt,
  };
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (existing) {
    throw new Error('Email sudah terdaftar');
  }

  const hashedPassword = await bcrypt.hash(input.password, 10);

  return prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        nip: input.nip || null,
        workUnit: input.workUnit || null,
        name: input.name,
        email: input.email,
        password: hashedPassword,
        role: input.role,
        gender: input.gender,
        quota: {
          create: {
            totalQuota: input.totalQuota,
            usedQuota: 0,
          },
        },
      },
      include: { quota: true },
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

    await ensureUserLeaveQuotas(newUser.id, new Date().getFullYear(), tx);

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

  const dataToUpdate: any = {};
  if (input.nip !== undefined) dataToUpdate.nip = input.nip || null;
  if (input.workUnit !== undefined) dataToUpdate.workUnit = input.workUnit || null;
  if (input.name) dataToUpdate.name = input.name;
  if (input.email) dataToUpdate.email = input.email;
  if (input.role) dataToUpdate.role = input.role;
  if (input.gender) dataToUpdate.gender = input.gender;
  if (input.password && input.password.trim().length > 0) {
    dataToUpdate.password = await bcrypt.hash(input.password, 10);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: dataToUpdate,
    });

    if (input.totalQuota !== undefined && user.quota) {
      const oldTotal = user.quota.totalQuota;
      const newTotal = input.totalQuota;
      const diff = newTotal - oldTotal;

      if (diff !== 0) {
        await tx.leaveQuota.update({
          where: { userId: id },
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
  });
}
