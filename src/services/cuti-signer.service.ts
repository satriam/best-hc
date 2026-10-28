import { prisma } from '@/lib/db';
import { Prisma, CutiSignerRole } from '@prisma/client';
import { CutiSignerInput, UpdateCutiSignerInput } from '@/schemas/cuti-signer.schema';

export interface CutiSignerFilter {
  role?: CutiSignerRole;
  activeOnly?: boolean;
}

/** Bentuk user terhubung yang dipakai API: `{ id: <linkId>, userId, name, email }`. */
export interface CutiSignerUserView {
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
} satisfies Prisma.CutiSignerSelect;

export type CutiSignerRow = Prisma.CutiSignerGetPayload<{ select: typeof signerSelect }>;

/** Ratakan pivot menjadi `users[]` (untuk tampilan) + `userIdList` (untuk form). */
export function serializeCutiSigner(signer: CutiSignerRow) {
  const users: CutiSignerUserView[] = signer.users
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

export async function getAllCutiSigners(filter: CutiSignerFilter = {}) {
  const rows = await prisma.cutiSigner.findMany({
    where: {
      ...(filter.role ? { role: filter.role } : {}),
      ...(filter.activeOnly ? { isActive: true } : {}),
    },
    select: signerSelect,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return rows.map(serializeCutiSigner);
}

export async function getCutiSignerById(id: string) {
  const row = await prisma.cutiSigner.findUnique({ where: { id }, select: signerSelect });
  return row ? serializeCutiSigner(row) : null;
}

/**
 * Penanda tangan default per role — dipakai blok tanda tangan pada cetak
 * permohonan cuti. Bila belum ada yang ditandai default, pakai baris aktif
 * pertama sesuai `sortOrder` supaya cetak tidak kosong.
 */
export async function getDefaultCutiSigners(): Promise<{
  knowing: ReturnType<typeof serializeCutiSigner> | null;
  approver: ReturnType<typeof serializeCutiSigner> | null;
}> {
  const rows = await getAllCutiSigners({ activeOnly: true });

  const pick = (role: CutiSignerRole) =>
    rows.find((row) => row.role === role && row.isDefault) ??
    rows.find((row) => row.role === role) ??
    null;

  return {
    knowing: pick(CutiSignerRole.KNOWING),
    approver: pick(CutiSignerRole.APPROVER),
  };
}

/** NIP harus unik per role (bila diisi). */
async function assertNipUnique(
  role: CutiSignerRole,
  nip: string | null | undefined,
  excludeId?: string
) {
  const normalized = nip?.trim();
  if (!normalized) return;

  const duplicate = await prisma.cutiSigner.findFirst({
    where: {
      role,
      nip: normalized,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });

  if (duplicate) {
    throw new Error(
      `NIP ${normalized} sudah dipakai penanda tangan lain (${duplicate.name}) pada role yang sama`
    );
  }
}

/** Pastikan SEMUA user yang akan dihubungkan benar-benar ada (satu query). */
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

export async function createCutiSigner(input: CutiSignerInput) {
  const userIds = normalizeUserIds(input.userIds);

  await assertNipUnique(input.role, input.nip);
  await assertUsersExist(userIds);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.cutiSigner.updateMany({
        where: { role: input.role, isDefault: true },
        data: { isDefault: false },
      });
    }

    const created = await tx.cutiSigner.create({
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

    return serializeCutiSigner(created);
  });
}

/**
 * Update HANYA field yang benar-benar dikirim klien.
 * Relasi user: `userIds` dikirim (walau `[]`) → seluruh tautan diganti;
 * tidak dikirim → tautan lama dibiarkan.
 */
export async function updateCutiSigner(id: string, input: UpdateCutiSignerInput) {
  const existing = await prisma.cutiSigner.findUnique({
    where: { id },
    select: { id: true, role: true },
  });
  if (!existing) throw new Error('Penanda tangan tidak ditemukan');

  const has = (key: keyof UpdateCutiSignerInput) =>
    Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined;

  const role = has('role') ? (input.role as CutiSignerRole) : existing.role;
  const replaceUsers = has('userIds');
  const userIds = replaceUsers ? normalizeUserIds(input.userIds) : [];

  if (has('nip')) {
    await assertNipUnique(role, input.nip, id);
  }
  if (replaceUsers) {
    await assertUsersExist(userIds);
  }

  const data: Prisma.CutiSignerUncheckedUpdateInput = {};
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
    // Hanya satu default per role.
    if (data.isDefault === true) {
      await tx.cutiSigner.updateMany({
        where: { role, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    if (replaceUsers) {
      await tx.cutiSignerUser.deleteMany({ where: { signerId: id } });
      if (userIds.length > 0) {
        await tx.cutiSignerUser.createMany({
          data: userIds.map((userId) => ({ signerId: id, userId })),
        });
      }
    }

    const updated = await tx.cutiSigner.update({
      where: { id },
      data,
      select: signerSelect,
    });

    return serializeCutiSigner(updated);
  });
}

/**
 * Hapus penanda tangan cuti (hard delete).
 * Belum ada tabel yang menyimpan referensi signer cuti — cetak selalu memakai
 * data master terbaru — jadi tidak perlu soft delete seperti SPKL.
 */
export async function deleteCutiSigner(id: string) {
  const existing = await prisma.cutiSigner.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new Error('Penanda tangan tidak ditemukan');

  await prisma.cutiSigner.delete({ where: { id } });
  return { id };
}
