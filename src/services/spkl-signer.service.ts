import { prisma } from '@/lib/db';
import { Prisma, SpklSignerRole } from '@prisma/client';
import { SpklSignerInput, UpdateSpklSignerInput } from '@/schemas/spkl.schema';

export interface SpklSignerFilter {
  role?: SpklSignerRole;
  activeOnly?: boolean;
}

const signerSelect = {
  id: true,
  role: true,
  userId: true,
  name: true,
  nip: true,
  position: true,
  department: true,
  workUnit: true,
  isActive: true,
  isDefault: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.SpklSignerSelect;

export async function getAllSpklSigners(filter: SpklSignerFilter = {}) {
  return prisma.spklSigner.findMany({
    where: {
      ...(filter.role ? { role: filter.role } : {}),
      ...(filter.activeOnly ? { isActive: true } : {}),
    },
    select: signerSelect,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getSpklSignerById(id: string) {
  return prisma.spklSigner.findUnique({
    where: { id },
    select: signerSelect,
  });
}

/** NIP harus unik per role (bila diisi). */
async function assertNipUnique(role: SpklSignerRole, nip: string | null | undefined, excludeId?: string) {
  const normalized = nip?.trim();
  if (!normalized) return;

  const duplicate = await prisma.spklSigner.findFirst({
    where: {
      role,
      nip: normalized,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });

  if (duplicate) {
    throw new Error(`NIP ${normalized} sudah dipakai penanda tangan lain (${duplicate.name}) pada role yang sama`);
  }
}

async function assertUserExists(userId: string | null | undefined) {
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new Error('User yang dihubungkan tidak ditemukan');
}

export async function createSpklSigner(input: SpklSignerInput) {
  await assertNipUnique(input.role, input.nip);
  await assertUserExists(input.userId);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.spklSigner.updateMany({
        where: { role: input.role, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.spklSigner.create({
      data: {
        role: input.role,
        name: input.name.trim(),
        nip: input.nip?.trim() || null,
        position: input.position?.trim() || null,
        department: input.department?.trim() || null,
        workUnit: input.workUnit?.trim() || null,
        userId: input.userId || null,
        isActive: input.isActive ?? true,
        isDefault: input.isDefault ?? false,
        sortOrder: input.sortOrder ?? 0,
      },
      select: signerSelect,
    });
  });
}

export async function updateSpklSigner(id: string, input: UpdateSpklSignerInput) {
  const existing = await prisma.spklSigner.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!existing) throw new Error('Penanda tangan tidak ditemukan');

  const role = input.role ?? existing.role;

  if (input.nip !== undefined) {
    await assertNipUnique(role, input.nip, id);
  }
  if (input.userId !== undefined) {
    await assertUserExists(input.userId);
  }

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.spklSigner.updateMany({
        where: { role, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return tx.spklSigner.update({
      where: { id },
      data: {
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.nip !== undefined ? { nip: input.nip?.trim() || null } : {}),
        ...(input.position !== undefined ? { position: input.position?.trim() || null } : {}),
        ...(input.department !== undefined ? { department: input.department?.trim() || null } : {}),
        ...(input.workUnit !== undefined ? { workUnit: input.workUnit?.trim() || null } : {}),
        ...(input.userId !== undefined ? { userId: input.userId || null } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      select: signerSelect,
    });
  });
}

/**
 * Hapus penanda tangan.
 * - Sudah dipakai SPKL → soft delete (`isActive = false`) supaya riwayat tetap utuh.
 * - Belum dipakai → hapus permanen.
 */
export async function deleteSpklSigner(id: string): Promise<{ mode: 'soft' | 'hard'; data: { id: string } | null }> {
  const existing = await prisma.spklSigner.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new Error('Penanda tangan tidak ditemukan');

  const usedCount = await prisma.spkl.count({
    where: { OR: [{ picId: id }, { approverId: id }] },
  });

  if (usedCount > 0) {
    const updated = await prisma.spklSigner.update({
      where: { id },
      data: { isActive: false, isDefault: false },
      select: { id: true },
    });
    return { mode: 'soft', data: updated };
  }

  await prisma.spklSigner.delete({ where: { id } });
  return { mode: 'hard', data: { id } };
}
