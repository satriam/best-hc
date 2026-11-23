import { prisma } from '@/lib/db';
import { LaporanSignerRole, Prisma } from '@prisma/client';
import type { LaporanSignerData } from '@/lib/laporan/types';
import type { LaporanSignerInput, UpdateLaporanSignerInput } from '@/schemas/laporan.schema';

/** Master penanda tangan lembar persetujuan laporan bulanan. */

export interface LaporanSignerFilter {
  role?: LaporanSignerRole;
  activeOnly?: boolean;
}

const signerSelect = {
  id: true,
  role: true,
  name: true,
  nip: true,
  position: true,
  department: true,
  isActive: true,
  isDefault: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LaporanSignerSelect;

export type LaporanSignerRow = Prisma.LaporanSignerGetPayload<{ select: typeof signerSelect }>;

/** Baris master → data yang dipakai generator (`position` = jabatan, `department` = instansi). */
export function toSignerData(row: LaporanSignerRow | null | undefined): LaporanSignerData | undefined {
  if (!row) return undefined;
  return {
    nama: row.name,
    jabatan: row.position ?? '',
    instansi: row.department ?? '',
    nip: row.nip ?? undefined,
  };
}

export async function getAllLaporanSigners(filter: LaporanSignerFilter = {}) {
  return prisma.laporanSigner.findMany({
    where: {
      ...(filter.role ? { role: filter.role } : {}),
      ...(filter.activeOnly ? { isActive: true } : {}),
    },
    select: signerSelect,
    orderBy: [{ role: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getLaporanSignerById(id: string) {
  return prisma.laporanSigner.findUnique({ where: { id }, select: signerSelect });
}

/**
 * Penanda tangan default per role. Role `DISETUJUI` boleh berisi lebih dari satu
 * orang (Direktur + Dept Head) — diambil sesuai `sortOrder` (maksimal 2 slot).
 */
export async function getDefaultLaporanSigners(): Promise<{
  dibuat?: LaporanSignerData;
  diperiksa?: LaporanSignerData;
  disetujui?: LaporanSignerData;
  disetujui2?: LaporanSignerData;
}> {
  const rows = await getAllLaporanSigners({ activeOnly: true });

  const pick = (role: LaporanSignerRole) =>
    rows.find((row) => row.role === role && row.isDefault) ?? rows.find((row) => row.role === role);

  const approvers = rows.filter((row) => row.role === LaporanSignerRole.DISETUJUI);
  const approverDefault = approvers.find((row) => row.isDefault) ?? approvers[0];
  const approverSecond = approvers.find((row) => row.id !== approverDefault?.id);

  return {
    dibuat: toSignerData(pick(LaporanSignerRole.DIBUAT) ?? null),
    diperiksa: toSignerData(pick(LaporanSignerRole.DIPERIKSA) ?? null),
    disetujui: toSignerData(approverDefault ?? null),
    disetujui2: toSignerData(approverSecond ?? null),
  };
}

/**
 * Id penanda tangan default per slot — dipakai `/api/laporan/defaults` saat
 * tabel `laporan_defaults` masih kosong supaya form tetap terisi.
 */
export async function getDefaultSignerSelection(): Promise<{
  dibuat: string;
  diperiksa: string;
  disetujui: string;
  disetujui2: string;
}> {
  const rows = await getAllLaporanSigners({ activeOnly: true });

  const pick = (role: LaporanSignerRole) =>
    (rows.find((row) => row.role === role && row.isDefault) ?? rows.find((row) => row.role === role))
      ?.id ?? '';

  const approvers = rows.filter((row) => row.role === LaporanSignerRole.DISETUJUI);
  const approverDefault = approvers.find((row) => row.isDefault) ?? approvers[0];
  const approverSecond = approvers.find((row) => row.id !== approverDefault?.id);

  return {
    dibuat: pick(LaporanSignerRole.DIBUAT),
    diperiksa: pick(LaporanSignerRole.DIPERIKSA),
    disetujui: approverDefault?.id ?? '',
    disetujui2: approverSecond?.id ?? '',
  };
}

async function assertNipUnique(role: LaporanSignerRole, nip: string | null | undefined, excludeId?: string) {
  const normalized = nip?.trim();
  if (!normalized) return;
  const duplicate = await prisma.laporanSigner.findFirst({
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

export async function createLaporanSigner(input: LaporanSignerInput) {
  await assertNipUnique(input.role, input.nip);

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.laporanSigner.updateMany({
        where: { role: input.role, isDefault: true },
        data: { isDefault: false },
      });
    }
    return tx.laporanSigner.create({
      data: {
        role: input.role,
        name: input.name.trim(),
        nip: input.nip?.trim() || null,
        position: input.position?.trim() || null,
        department: input.department?.trim() || null,
        isActive: input.isActive ?? true,
        isDefault: input.isDefault ?? false,
        sortOrder: input.sortOrder ?? 0,
      },
      select: signerSelect,
    });
  });
}

export async function updateLaporanSigner(id: string, input: UpdateLaporanSignerInput) {
  const existing = await prisma.laporanSigner.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!existing) throw new Error('Penanda tangan tidak ditemukan');

  const has = (key: keyof UpdateLaporanSignerInput) =>
    Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined;

  const role = has('role') ? (input.role as LaporanSignerRole) : existing.role;
  if (has('nip')) await assertNipUnique(role, input.nip, id);

  const data: Prisma.LaporanSignerUncheckedUpdateInput = {};
  if (has('role') && input.role !== undefined) data.role = input.role;
  if (has('name') && input.name !== undefined) data.name = input.name.trim();
  if (has('nip')) data.nip = input.nip?.trim() || null;
  if (has('position')) data.position = input.position?.trim() || null;
  if (has('department')) data.department = input.department?.trim() || null;
  if (has('isActive') && input.isActive !== undefined) data.isActive = input.isActive;
  if (has('isDefault') && input.isDefault !== undefined) data.isDefault = input.isDefault;
  if (has('sortOrder') && input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

  return prisma.$transaction(async (tx) => {
    if (data.isDefault === true) {
      await tx.laporanSigner.updateMany({
        where: { role, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }
    return tx.laporanSigner.update({ where: { id }, data, select: signerSelect });
  });
}

/** Hapus penanda tangan (hard delete) — laporan tersimpan menyimpan datanya sendiri. */
export async function deleteLaporanSigner(id: string) {
  const existing = await prisma.laporanSigner.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new Error('Penanda tangan tidak ditemukan');
  await prisma.laporanSigner.delete({ where: { id } });
  return { id };
}
