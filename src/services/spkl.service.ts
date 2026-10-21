import { prisma } from '@/lib/db';
import { Prisma, Role, SpklSignerRole, SpklStatus, SpklType } from '@prisma/client';
import {
  CreateSpklInput,
  SpklItemInput,
  UpdateSpklInput,
  UpdateSpklStatusInput,
} from '@/schemas/spkl.schema';
import {
  computeHours,
  computeTotal,
  formatSpklNumber,
  normalizeWorkUnit,
  parseSpklSequence,
  roundHours,
  validatePp35,
  validateWorkDate,
} from '@/lib/spkl';
import { getSignerIdsForUser } from '@/services/spkl-signer.service';

/** Aktor yang sedang memanggil API (dari JWT session). */
export interface SpklActor {
  id: string;
  role: Role;
}

export interface SpklFilterOptions {
  /** ADMIN: semua; USER: dipaksa ke id sendiri oleh route handler. */
  userId?: string;
  /**
   * Signer APPROVER yang terhubung ke user pemanggil. SPKL dengan `approverId`
   * di daftar ini ikut terlihat (satu penyetuju bisa dipegang banyak user).
   */
  approverSignerIds?: string[];
  status?: SpklStatus;
  type?: SpklType;
  /** Rentang tanggal lembur (item), format `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  /** Rentang tanggal dibuat, format `YYYY-MM-DD`. */
  createdFrom?: string;
  createdTo?: string;
  search?: string;
  page?: number;
  limit?: number;
}

const signerSummary = {
  id: true,
  name: true,
  nip: true,
  position: true,
  department: true,
  workUnit: true,
  users: {
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
} satisfies Prisma.SpklSignerSelect;

const spklDetailInclude = {
  pic: { select: signerSummary },
  approver: { select: signerSummary },
  requester: { select: { id: true, name: true, email: true } },
  items: { orderBy: { order: 'asc' } },
} satisfies Prisma.SpklInclude;

const spklListInclude = {
  pic: { select: signerSummary },
  approver: { select: signerSummary },
  requester: { select: { id: true, name: true, email: true } },
  items: { select: { workerNik: true, workerName: true, workDate: true, hours: true } },
} satisfies Prisma.SpklInclude;

type SpklWithItems = Prisma.SpklGetPayload<{ include: typeof spklDetailInclude }>;
type SpklWithList = Prisma.SpklGetPayload<{ include: typeof spklListInclude }>;
type SignerSummaryRow = Prisma.SpklSignerGetPayload<{ select: typeof signerSummary }>;

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Math.round(Number(value) * 100) / 100;
}

/**
 * Ratakan relasi pivot PIC/penyetuju: `users[]` (untuk tampilan) + `userIdList`
 * (untuk pengecekan cepat di klien).
 */
function serializeSignerSummary(signer: SignerSummaryRow) {
  const users = signer.users
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

/** Ubah Decimal Prisma menjadi number agar JSON API enak dipakai UI. */
function serializeDetail(spkl: SpklWithItems) {
  return {
    ...spkl,
    pic: serializeSignerSummary(spkl.pic),
    approver: serializeSignerSummary(spkl.approver),
    totalHours: decimalToNumber(spkl.totalHours),
    items: spkl.items.map((item) => ({ ...item, hours: decimalToNumber(item.hours) })),
  };
}

function serializeListItem(spkl: SpklWithList) {
  const uniqueWorkers = new Set(spkl.items.map((item) => item.workerNik));

  return {
    ...spkl,
    pic: serializeSignerSummary(spkl.pic),
    approver: serializeSignerSummary(spkl.approver),
    totalHours: decimalToNumber(spkl.totalHours),
    itemCount: spkl.items.length,
    workerCount: uniqueWorkers.size,
    items: spkl.items.map((item) => ({ ...item, hours: decimalToNumber(item.hours) })),
  };
}

/** Parse `YYYY-MM-DD` menjadi Date UTC midnight (stabil lintas timezone). */
export function parseWorkDate(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const key = value.slice(0, 10);
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

interface NormalizedItem {
  order: number;
  workerNik: string;
  workerName: string;
  workerPosition: string | null;
  company: string | null;
  taskDescription: string;
  workDate: Date;
  startTime: string;
  endTime: string;
  hours: number;
}

const DEFAULT_COMPANY = 'PT Bukit Energi Servis Terpadu';

/**
 * Normalisasi + validasi baris rincian.
 * Jam SELALU dihitung ulang di server dari `startTime`–`endTime`.
 */
export function normalizeSpklItems(items: SpklItemInput[]): NormalizedItem[] {
  if (!items || items.length === 0) {
    throw new Error('Minimal 1 baris pekerja');
  }

  return items.map((item, index) => {
    const workDate = parseWorkDate(item.workDate);

    const dateError = validateWorkDate(workDate);
    if (dateError) throw new Error(dateError);

    const hours = computeHours(item.startTime, item.endTime);
    if (!(hours > 0)) {
      throw new Error(
        `Jam lembur ${item.workerName} pada baris ${index + 1} harus lebih dari 0 (periksa jam mulai/selesai)`
      );
    }

    return {
      order: index,
      workerNik: item.workerNik.trim(),
      workerName: item.workerName.trim(),
      workerPosition: item.workerPosition?.trim() || null,
      company: item.company?.trim() || DEFAULT_COMPANY,
      taskDescription: item.taskDescription.trim(),
      workDate,
      startTime: item.startTime,
      endTime: item.endTime,
      hours: roundHours(hours),
    };
  });
}

async function getActiveSigner(id: string, role: SpklSignerRole, label: string) {
  const signer = await prisma.spklSigner.findUnique({
    where: { id },
    select: { id: true, role: true, isActive: true, name: true, workUnit: true },
  });

  if (!signer) throw new Error(`${label} tidak ditemukan`);
  if (signer.role !== role) {
    throw new Error(
      `${label} tidak valid: ${signer.name} bukan ${role === SpklSignerRole.PIC ? 'PIC (Yang Menugaskan)' : 'Penyetuju (Yang Menyetujui)'}`
    );
  }
  if (!signer.isActive) throw new Error(`${label} ${signer.name} sudah tidak aktif`);

  return signer;
}

/**
 * Ambil item SPKL lain milik user yang sama (status ON_PROGRESS/APPROVED)
 * untuk menghitung akumulasi jam mingguan/bulanan.
 */
async function fetchExistingItems(
  requesterId: string,
  items: { workerNik: string; workDate: Date }[],
  excludeSpklId?: string
) {
  if (items.length === 0) return [];

  const timestamps = items.map((item) => item.workDate.getTime());
  const min = new Date(Math.min(...timestamps));
  const max = new Date(Math.max(...timestamps));
  const DAY = 24 * 60 * 60 * 1000;

  // Perluas ke awal bulan (min) dan akhir bulan (max) + 7 hari agar batas
  // minggu/bulan yang melintasi bulan tetap tertangkap.
  const rangeStart = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1) - 7 * DAY);
  const rangeEnd = new Date(Date.UTC(max.getUTCFullYear(), max.getUTCMonth() + 1, 1) + 7 * DAY);

  const rows = await prisma.spklItem.findMany({
    where: {
      workerNik: { in: Array.from(new Set(items.map((item) => item.workerNik))) },
      workDate: { gte: rangeStart, lte: rangeEnd },
      spkl: {
        requesterId,
        status: { in: [SpklStatus.ON_PROGRESS, SpklStatus.APPROVED] },
        deletedAt: null,
        ...(excludeSpklId ? { id: { not: excludeSpklId } } : {}),
      },
    },
    select: {
      workerNik: true,
      workerName: true,
      workDate: true,
      hours: true,
      spkl: { select: { type: true } },
    },
  });

  return rows.map((row) => ({
    workerNik: row.workerNik,
    workerName: row.workerName,
    workDate: row.workDate,
    hours: decimalToNumber(row.hours),
    type: row.spkl.type,
  }));
}

/**
 * Validasi PP 35/2021 untuk sekumpulan item.
 * Mengembalikan `warnings` (mingguan/bulanan) atau melempar error (harian / strict).
 */
async function runPp35Validation(
  requesterId: string,
  type: SpklType,
  items: NormalizedItem[],
  options: { strict?: boolean; excludeSpklId?: string } = {}
): Promise<string[]> {
  const existing = await fetchExistingItems(requesterId, items, options.excludeSpklId);

  const result = validatePp35(
    items.map((item) => ({
      workerNik: item.workerNik,
      workerName: item.workerName,
      workDate: item.workDate,
      hours: item.hours,
      type,
    })),
    existing,
    { strict: options.strict }
  );

  if (result.errors.length > 0) {
    throw new Error(result.errors.join('; '));
  }

  return result.warnings;
}

/** Nomor urut berikutnya untuk `<unit>/<tahun>` (dalam transaksi). */
async function nextSpklNumber(
  client: Prisma.TransactionClient | typeof prisma,
  workUnit: string | null | undefined,
  year: number
): Promise<string> {
  const unit = normalizeWorkUnit(workUnit);
  const rows = await client.spkl.findMany({
    where: { number: { endsWith: `/SPKL/${unit}/${year}` } },
    select: { number: true },
  });

  const maxSeq = rows.reduce((max, row) => Math.max(max, parseSpklSequence(row.number)), 0);
  return formatSpklNumber(maxSeq + 1, unit, year);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function getSpkls(options: SpklFilterOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 10));

  const where: Prisma.SpklWhereInput = { deletedAt: null };
  const and: Prisma.SpklWhereInput[] = [];

  // Kepemilikan: milik sendiri ATAU SPKL yang penyetujunya terhubung ke user ini.
  if (options.userId || (options.approverSignerIds && options.approverSignerIds.length > 0)) {
    const ownership: Prisma.SpklWhereInput[] = [];
    if (options.userId) ownership.push({ requesterId: options.userId });
    if (options.approverSignerIds && options.approverSignerIds.length > 0) {
      ownership.push({ approverId: { in: options.approverSignerIds } });
    }
    and.push(ownership.length === 1 ? ownership[0] : { OR: ownership });
  }

  if (options.status) where.status = options.status;
  if (options.type) where.type = options.type;

  if (options.from || options.to) {
    const range: Prisma.DateTimeFilter = {};
    if (options.from) range.gte = parseWorkDate(options.from);
    if (options.to) range.lte = parseWorkDate(options.to);
    where.items = { some: { workDate: range } };
  }

  if (options.createdFrom || options.createdTo) {
    const createdRange: Prisma.DateTimeFilter = {};
    if (options.createdFrom) createdRange.gte = parseWorkDate(options.createdFrom);
    if (options.createdTo) {
      const end = parseWorkDate(options.createdTo);
      end.setUTCHours(23, 59, 59, 999);
      createdRange.lte = end;
    }
    where.createdAt = createdRange;
  }

  if (options.search?.trim()) {
    const keyword = options.search.trim();
    where.OR = [
      { number: { contains: keyword, mode: 'insensitive' } },
      { items: { some: { workerName: { contains: keyword, mode: 'insensitive' } } } },
      { items: { some: { workerNik: { contains: keyword, mode: 'insensitive' } } } },
    ];
  }

  if (and.length > 0) where.AND = and;

  const [total, rows] = await Promise.all([
    prisma.spkl.count({ where }),
    prisma.spkl.findMany({
      where,
      include: spklListInclude,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: rows.map(serializeListItem),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function getSpklById(id: string, actor?: SpklActor) {
  const spkl = await prisma.spkl.findFirst({
    where: { id, deletedAt: null },
    include: spklDetailInclude,
  });

  if (!spkl) return null;

  if (actor && actor.role !== Role.ADMIN) {
    const isOwner = spkl.requesterId === actor.id;
    const isApprover =
      !isOwner && (await getSignerIdsForUser(actor.id)).includes(spkl.approverId);
    if (!isOwner && !isApprover) {
      throw new Error('Forbidden: Anda tidak berhak melihat SPKL ini');
    }
  }

  return serializeDetail(spkl);
}

export interface CreateSpklOptions {
  strict?: boolean;
  /** ADMIN boleh membuat atas nama user lain. */
  requesterId?: string;
}

export async function createSpkl(actor: SpklActor, input: CreateSpklInput, options: CreateSpklOptions = {}) {
  const requesterId =
    actor.role === Role.ADMIN && options.requesterId ? options.requesterId : actor.id;

  const requester = await prisma.user.findFirst({
    where: { id: requesterId, deletedAt: null },
    select: { id: true },
  });
  if (!requester) throw new Error('User pembuat SPKL tidak ditemukan');

  const pic = await getActiveSigner(input.picId, SpklSignerRole.PIC, 'PIC (Yang Menugaskan)');
  const approver = await getActiveSigner(
    input.approverId,
    SpklSignerRole.APPROVER,
    'Penyetuju (Yang Menyetujui)'
  );

  const items = normalizeSpklItems(input.items);
  const totalHours = computeTotal(items);

  const warnings = await runPp35Validation(requesterId, input.type, items, { strict: options.strict });

  const workUnit = input.workUnit?.trim() || pic.workUnit || null;
  const status = input.submit ? SpklStatus.ON_PROGRESS : SpklStatus.DRAFT;

  const year = new Date().getUTCFullYear();

  // Nomor SPKL dibuat dalam transaksi; bila dua permintaan bersamaan mendapat
  // nomor yang sama, unique constraint menolak dan kita coba ulang.
  let created: SpklWithItems | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    try {
      created = await prisma.$transaction(async (tx) => {
        const number = await nextSpklNumber(tx, workUnit, year);

        return tx.spkl.create({
          data: {
            number,
            requesterId,
            picId: pic.id,
            approverId: approver.id,
            type: input.type,
            workUnit,
            status,
            notes: input.notes?.trim() || null,
            totalHours,
            items: {
              create: items.map((item) => ({
                order: item.order,
                workerNik: item.workerNik,
                workerName: item.workerName,
                workerPosition: item.workerPosition,
                company: item.company,
                taskDescription: item.taskDescription,
                workDate: item.workDate,
                startTime: item.startTime,
                endTime: item.endTime,
                hours: item.hours,
              })),
            },
          },
          include: spklDetailInclude,
        });
      });
    } catch (error) {
      lastError = error;
      if (!isUniqueConstraintError(error)) throw error;
    }
  }

  if (!created) {
    throw lastError instanceof Error
      ? lastError
      : new Error('Gagal membuat nomor SPKL unik, silakan coba lagi');
  }

  return { spkl: serializeDetail(created), warnings };
}

export interface UpdateSpklOptions {
  strict?: boolean;
}

export async function updateSpkl(
  id: string,
  actor: SpklActor,
  input: UpdateSpklInput,
  options: UpdateSpklOptions = {}
) {
  const existing = await prisma.spkl.findFirst({
    where: { id, deletedAt: null },
    include: spklDetailInclude,
  });

  if (!existing) throw new Error('SPKL tidak ditemukan');

  if (actor.role !== Role.ADMIN && existing.requesterId !== actor.id) {
    throw new Error('Forbidden: hanya pembuat atau admin yang boleh mengubah SPKL ini');
  }

  if (existing.status !== SpklStatus.DRAFT && existing.status !== SpklStatus.ON_PROGRESS) {
    throw new Error(
      `SPKL dengan status ${existing.status} tidak dapat diubah (hanya DRAFT/ON_PROGRESS)`
    );
  }

  const type = input.type ?? existing.type;

  if (input.picId && input.picId !== existing.picId) {
    await getActiveSigner(input.picId, SpklSignerRole.PIC, 'PIC (Yang Menugaskan)');
  }
  if (input.approverId && input.approverId !== existing.approverId) {
    await getActiveSigner(input.approverId, SpklSignerRole.APPROVER, 'Penyetuju (Yang Menyetujui)');
  }

  const items = input.items ? normalizeSpklItems(input.items) : null;
  const totalHours = items ? computeTotal(items) : decimalToNumber(existing.totalHours);

  let warnings: string[] = [];

  if (items) {
    warnings = await runPp35Validation(existing.requesterId, type, items, {
      strict: options.strict,
      excludeSpklId: existing.id,
    });
  }

  const nextStatus =
    input.submit && existing.status === SpklStatus.DRAFT ? SpklStatus.ON_PROGRESS : existing.status;

  const updated = await prisma.$transaction(async (tx) => {
    if (items) {
      await tx.spklItem.deleteMany({ where: { spklId: existing.id } });
    }

    return tx.spkl.update({
      where: { id: existing.id },
      data: {
        ...(input.picId ? { picId: input.picId } : {}),
        ...(input.approverId ? { approverId: input.approverId } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.workUnit !== undefined ? { workUnit: input.workUnit?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        status: nextStatus,
        totalHours,
        ...(items
          ? {
              items: {
                create: items.map((item) => ({
                  order: item.order,
                  workerNik: item.workerNik,
                  workerName: item.workerName,
                  workerPosition: item.workerPosition,
                  company: item.company,
                  taskDescription: item.taskDescription,
                  workDate: item.workDate,
                  startTime: item.startTime,
                  endTime: item.endTime,
                  hours: item.hours,
                })),
              },
            }
          : {}),
      },
      include: spklDetailInclude,
    });
  });

  return { spkl: serializeDetail(updated), warnings };
}

export async function updateSpklStatus(id: string, actor: SpklActor, input: UpdateSpklStatusInput) {
  const existing = await prisma.spkl.findFirst({
    where: { id, deletedAt: null },
    include: spklDetailInclude,
  });

  if (!existing) throw new Error('SPKL tidak ditemukan');

  const isOwner = existing.requesterId === actor.id;
  const isAdmin = actor.role === Role.ADMIN;
  // Penyetuju boleh dipegang banyak user: cek keanggotaan lewat relasi pivot.
  const isApprover =
    !isAdmin && !isOwner
      ? (await getSignerIdsForUser(actor.id)).includes(existing.approverId)
      : false;

  const nextStatus = input.status;

  if (nextStatus === SpklStatus.APPROVED || nextStatus === SpklStatus.REJECTED) {
    if (!isAdmin && !isApprover) {
      throw new Error('Forbidden: hanya admin atau penyetuju terkait yang boleh menyetujui/menolak');
    }
    if (existing.status === SpklStatus.CANCELLED) {
      throw new Error('SPKL yang sudah dibatalkan tidak dapat disetujui/ditolak');
    }
    if (nextStatus === SpklStatus.REJECTED && !input.rejectedNote?.trim()) {
      throw new Error('Alasan penolakan wajib diisi');
    }
  } else if (nextStatus === SpklStatus.CANCELLED || nextStatus === SpklStatus.ON_PROGRESS) {
    if (!isAdmin && !isOwner) {
      throw new Error('Forbidden: hanya pembuat atau admin yang boleh mengubah status ini');
    }
    if (nextStatus === SpklStatus.CANCELLED && existing.status === SpklStatus.APPROVED) {
      throw new Error('SPKL yang sudah disetujui tidak dapat dibatalkan');
    }
  }

  const updated = await prisma.spkl.update({
    where: { id: existing.id },
    data: {
      status: nextStatus,
      ...(nextStatus === SpklStatus.APPROVED
        ? { approvedAt: new Date(), approvedById: actor.id, rejectedNote: null }
        : {}),
      ...(nextStatus === SpklStatus.REJECTED
        ? { approvedAt: null, approvedById: null, rejectedNote: input.rejectedNote?.trim() || null }
        : {}),
    },
    include: spklDetailInclude,
  });

  return serializeDetail(updated);
}

export async function deleteSpkl(id: string, actor: SpklActor) {
  const existing = await prisma.spkl.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, requesterId: true, status: true },
  });

  if (!existing) throw new Error('SPKL tidak ditemukan');

  if (actor.role !== Role.ADMIN && existing.requesterId !== actor.id) {
    throw new Error('Forbidden: hanya pembuat atau admin yang boleh menghapus SPKL ini');
  }

  if (existing.status !== SpklStatus.DRAFT) {
    throw new Error('Hanya SPKL berstatus DRAFT yang dapat dihapus');
  }

  await prisma.spkl.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  });

  return { id: existing.id };
}
