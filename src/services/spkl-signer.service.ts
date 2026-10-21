import { prisma } from '@/lib/db';
import { Prisma, SpklSignerRole } from '@prisma/client';
import { SpklSignerInput, UpdateSpklSignerInput } from '@/schemas/spkl.schema';

export interface SpklSignerFilter {
  role?: SpklSignerRole;
  activeOnly?: boolean;
}

/**
 * Bentuk user terhubung yang dipakai API:
 * `{ id: <linkId>, userId, name, email }`.
 */
export interface SpklSignerUserView {
  id: string;
  userId: string;
  name: string;
  email: string;
}

const signerSelect = {
  id: true,
  role: true,
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
  users: {
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.SpklSignerSelect;

export type SpklSignerRow = Prisma.SpklSignerGetPayload<{ select: typeof signerSelect }>;

/**
 * Ratakan relasi pivot menjadi `users[]` (lengkap untuk tampilan) + `userIdList`
 * (praktis untuk form/multi-select di frontend).
 */
export function serializeSigner(signer: SpklSignerRow) {
  const users: SpklSignerUserView[] = signer.users
    .map((link) => ({
      id: link.id,
      userId: link.user.id,
      name: link.user.name,
      email: link.user.email,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...signer,
    users,
    userIdList: users.map((user) => user.userId),
  };
}

/** Buang duplikat + entri kosong supaya `@@unique([signerId, userId])` tidak pecah. */
function normalizeUserIds(userIds: string[] | undefined | null): string[] {
  if (!userIds || userIds.length === 0) return [];
  return Array.from(new Set(userIds.map((id) => id.trim()).filter((id) => id.length > 0)));
}

export async function getAllSpklSigners(filter: SpklSignerFilter = {}) {
  const rows = await prisma.spklSigner.findMany({
    where: {
      ...(filter.role ? { role: filter.role } : {}),
      ...(filter.activeOnly ? { isActive: true } : {}),
    },
    select: signerSelect,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return rows.map(serializeSigner);
}

export async function getSpklSignerById(id: string) {
  const row = await prisma.spklSigner.findUnique({
    where: { id },
    select: signerSelect,
  });

  return row ? serializeSigner(row) : null;
}

/**
 * ID signer (APPROVER) yang terhubung ke user tertentu.
 * Dipakai untuk memberi hak lihat/approve SPKL kepada semua user yang
 * dihubungkan ke penyetuju tersebut.
 */
export async function getSignerIdsForUser(userId: string): Promise<string[]> {
  const links = await prisma.spklSignerUser.findMany({
    where: { userId, signer: { role: SpklSignerRole.APPROVER } },
    select: { signerId: true },
  });

  return Array.from(new Set(links.map((link) => link.signerId)));
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

/**
 * Pastikan SEMUA user yang akan dihubungkan benar-benar ada (satu query).
 * Bila ada yang tidak ditemukan → error 400 yang menyebut id bermasalah.
 */
async function assertUsersExist(userIds: string[]) {
  if (userIds.length === 0) return;

  const found = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });

  const foundIds = new Set(found.map((user) => user.id));
  const missing = userIds.filter((id) => !foundIds.has(id));

  if (missing.length > 0) {
    throw new Error(`User yang dihubungkan tidak ditemukan: ${missing.join(', ')}`);
  }
}

export async function createSpklSigner(input: SpklSignerInput) {
  const userIds = normalizeUserIds(input.userIds);

  await assertNipUnique(input.role, input.nip);
  await assertUsersExist(userIds);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.spklSigner.updateMany({
        where: { role: input.role, isDefault: true },
        data: { isDefault: false },
      });
    }

    const created = await tx.spklSigner.create({
      data: {
        role: input.role,
        name: input.name.trim(),
        nip: input.nip?.trim() || null,
        position: input.position?.trim() || null,
        department: input.department?.trim() || null,
        workUnit: input.workUnit?.trim() || null,
        isActive: input.isActive ?? true,
        isDefault: input.isDefault ?? false,
        sortOrder: input.sortOrder ?? 0,
        ...(userIds.length > 0
          ? { users: { create: userIds.map((userId) => ({ userId })) } }
          : {}),
      },
      select: signerSelect,
    });

    return serializeSigner(created);
  });
}

/**
 * Bangun payload `update` HANYA dari key yang benar-benar dikirim klien.
 * Penting: jangan pakai pola `input.field ?? <default>` di sini — itu akan menimpa
 * field lain saat klien hanya mengirim satu field (mis. `{ "position": "..." }`).
 *
 * Relasi user:
 * - `userIds` dikirim (walau `[]`) → seluruh tautan diganti.
 * - `userIds` tidak dikirim         → tautan lama tidak disentuh sama sekali.
 */
export async function updateSpklSigner(id: string, input: UpdateSpklSignerInput) {
  const existing = await prisma.spklSigner.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!existing) throw new Error('Penanda tangan tidak ditemukan');

  const has = (key: keyof UpdateSpklSignerInput) =>
    Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined;

  const role = has('role') ? (input.role as SpklSignerRole) : existing.role;
  const replaceUsers = has('userIds');
  const userIds = replaceUsers ? normalizeUserIds(input.userIds) : [];

  if (has('nip')) {
    await assertNipUnique(role, input.nip, id);
  }
  if (replaceUsers) {
    await assertUsersExist(userIds);
  }

  const data: Prisma.SpklSignerUncheckedUpdateInput = {};
  if (has('role') && input.role !== undefined) data.role = input.role;
  if (has('name') && input.name !== undefined) data.name = input.name.trim();
  if (has('nip')) data.nip = input.nip?.trim() || null;
  if (has('position')) data.position = input.position?.trim() || null;
  if (has('department')) data.department = input.department?.trim() || null;
  if (has('workUnit')) data.workUnit = input.workUnit?.trim() || null;
  if (has('isActive') && input.isActive !== undefined) data.isActive = input.isActive;
  if (has('isDefault') && input.isDefault !== undefined) data.isDefault = input.isDefault;
  if (has('sortOrder') && input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  if (Object.keys(data).length === 0 && !replaceUsers) {
    throw new Error('Tidak ada data yang diubah');
  }

  return prisma.$transaction(async (tx) => {
    // Hanya satu default per role: bila signer ini dijadikan default, lepaskan yang lain.
    if (data.isDefault === true) {
      await tx.spklSigner.updateMany({
        where: { role, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    if (replaceUsers) {
      // Ganti seluruh relasi: `[]` berarti lepas semua tautan.
      await tx.spklSignerUser.deleteMany({ where: { signerId: id } });
      if (userIds.length > 0) {
        await tx.spklSignerUser.createMany({
          data: userIds.map((userId) => ({ signerId: id, userId })),
        });
      }
    }

    const updated = await tx.spklSigner.update({
      where: { id },
      data,
      select: signerSelect,
    });

    return serializeSigner(updated);
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
