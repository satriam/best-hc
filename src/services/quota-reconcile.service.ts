import { LeaveStatus, Prisma, QuotaHistoryType } from '@prisma/client';
import { prisma } from '@/lib/db';

/**
 * Rekonsiliasi kuota cuti.
 *
 * Sumber kebenaran pemakaian kuota = `leave_request_segments` pada pengajuan
 * berstatus APPROVED / DONE. Tabel `user_leave_quotas.usedQuota` dan
 * `leave_quotas.usedQuota` (kuota tahunan generik) hanyalah cache yang bisa
 * melenceng karena data legacy (pemotongan lama yang hanya tercatat di salah
 * satu tabel).
 *
 * Modul ini menyediakan:
 * - `auditQuotaConsistency()`  → baca-saja, mengembalikan daftar drift.
 * - `reconcileQuota()`         → menulis perbaikan dalam satu transaksi.
 */

/** Nama jenis cuti tahunan — satu-satunya jenis yang memotong `leave_quotas` generik. */
export const ANNUAL_LEAVE_NAME = 'Cuti Tahunan';
/** Kuota >= ambang ini dianggap tak terbatas (tidak pernah dicek/dipotong). */
export const UNLIMITED_QUOTA_THRESHOLD = 999;
/** Status pengajuan yang benar-benar memotong kuota. */
export const QUOTA_AFFECTING_STATUSES: LeaveStatus[] = [LeaveStatus.APPROVED, LeaveStatus.DONE];

/** Penanda pada baris history yang baseline-nya mustahil (warisan kuota generik). */
export const LEGACY_BASELINE_MARKER = '[baseline legacy — diabaikan untuk perhitungan]';
/** Awalan deskripsi baris koreksi yang dibuat untuk menggantikan baseline legacy. */
export const LEGACY_CORRECTION_PREFIX = '[Koreksi baseline legacy]';

export interface UsedQuotaDrift {
  userId: string;
  userName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  year: number;
  totalQuota: number;
  storedUsedQuota: number;
  expectedUsedQuota: number;
  difference: number;
}

export interface GenericQuotaDrift {
  userId: string;
  userName: string;
  totalQuota: number;
  storedUsedQuota: number;
  expectedUsedQuota: number;
  difference: number;
}

export interface LegacyBaselineRow {
  id: string;
  userId: string;
  userName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveRequestId: string | null;
  previousQuota: number;
  changeAmount: number;
  newQuota: number;
  totalQuota: number;
  description: string | null;
}

export interface QuotaConsistencyReport {
  usedQuotaDrift: UsedQuotaDrift[];
  genericQuotaDrift: GenericQuotaDrift[];
  /** Baris history ber-baseline mustahil yang BELUM ditandai (butuh tindakan). */
  legacyBaselineRows: LegacyBaselineRow[];
  /** Baris history ber-baseline mustahil yang sudah ditandai & dikoreksi (audit trail). */
  acknowledgedLegacyRows: LegacyBaselineRow[];
}

export interface ReconcileChanges {
  usedQuotaUpdated: Array<{ userName: string; leaveTypeName: string; year: number; from: number; to: number }>;
  genericQuotaUpdated: Array<{ userName: string; from: number; to: number }>;
  legacyRowsMarked: Array<{ userName: string; leaveTypeName: string; historyId: string }>;
  legacyCorrectionsCreated: Array<{ userName: string; leaveTypeName: string; historyId: string }>;
}

export interface ReconcileResult {
  before: QuotaConsistencyReport;
  after: QuotaConsistencyReport;
  changes: ReconcileChanges;
}

type Client = Prisma.TransactionClient | typeof prisma;

interface ApprovedDaysRow {
  userId: string;
  leaveTypeId: string;
  days: number;
}

/**
 * Hitung hari cuti terpakai per `userId + leaveTypeId` dari sumber kebenaran
 * (`leave_request_segments` pada pengajuan APPROVED/DONE, belum dihapus).
 * Pengajuan lama tanpa segmen memakai `totalDays` dan dibebankan ke jenis cuti pertama.
 */
export async function collectApprovedDaysByType(client: Client = prisma): Promise<ApprovedDaysRow[]> {
  const requests = await client.leaveRequest.findMany({
    where: { deletedAt: null, status: { in: QUOTA_AFFECTING_STATUSES } },
    select: {
      userId: true,
      totalDays: true,
      segments: { select: { leaveTypeId: true, totalDays: true } },
      requestTypes: { select: { leaveTypeId: true }, orderBy: { createdAt: 'asc' } },
    },
  });

  const totals = new Map<string, ApprovedDaysRow>();

  const add = (userId: string, leaveTypeId: string, days: number) => {
    const key = `${userId}|${leaveTypeId}`;
    const row = totals.get(key) ?? { userId, leaveTypeId, days: 0 };
    row.days += days;
    totals.set(key, row);
  };

  for (const request of requests) {
    if (request.segments.length > 0) {
      for (const segment of request.segments) add(request.userId, segment.leaveTypeId, segment.totalDays);
    } else if (request.requestTypes.length > 0) {
      // Data lama tanpa segmen: `totalDays` hanya pasti untuk satu jenis cuti.
      add(request.userId, request.requestTypes[0].leaveTypeId, request.totalDays);
    }
  }

  return Array.from(totals.values());
}

function approvedDaysMap(rows: ApprovedDaysRow[]): Map<string, number> {
  return new Map(rows.map((row) => [`${row.userId}|${row.leaveTypeId}`, row.days]));
}

/** Daftar drift kuota (baca-saja). Dipakai script rekonsiliasi & bisa dipanggil manual. */
export async function auditQuotaConsistency(client: Client = prisma): Promise<QuotaConsistencyReport> {
  const approved = approvedDaysMap(await collectApprovedDaysByType(client));

  const quotas = await client.userLeaveQuota.findMany({
    include: { user: { select: { name: true } }, leaveType: { select: { id: true, name: true } } },
    orderBy: [{ userId: 'asc' }, { leaveTypeId: 'asc' }, { year: 'asc' }],
  });

  const usedQuotaDrift: UsedQuotaDrift[] = [];
  for (const quota of quotas) {
    const expected = approved.get(`${quota.userId}|${quota.leaveTypeId}`) ?? 0;
    if (quota.usedQuota === expected) continue;
    usedQuotaDrift.push({
      userId: quota.userId,
      userName: quota.user.name,
      leaveTypeId: quota.leaveTypeId,
      leaveTypeName: quota.leaveType.name,
      year: quota.year,
      totalQuota: quota.totalQuota,
      storedUsedQuota: quota.usedQuota,
      expectedUsedQuota: expected,
      difference: quota.usedQuota - expected,
    });
  }

  // Kuota tahunan generik hanya boleh memuat hari Cuti Tahunan.
  const annualTypeIds = new Set(
    (await client.leaveType.findMany({ where: { name: ANNUAL_LEAVE_NAME }, select: { id: true } })).map((t) => t.id)
  );
  const genericExpected = new Map<string, number>();
  for (const [key, days] of approved) {
    const [userId, leaveTypeId] = key.split('|');
    if (!annualTypeIds.has(leaveTypeId)) continue;
    genericExpected.set(userId, (genericExpected.get(userId) ?? 0) + days);
  }

  const genericQuotas = await client.leaveQuota.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { userId: 'asc' },
  });

  const genericQuotaDrift: GenericQuotaDrift[] = [];
  for (const quota of genericQuotas) {
    const expected = genericExpected.get(quota.userId) ?? 0;
    if (quota.usedQuota === expected) continue;
    genericQuotaDrift.push({
      userId: quota.userId,
      userName: quota.user.name,
      totalQuota: quota.totalQuota,
      storedUsedQuota: quota.usedQuota,
      expectedUsedQuota: expected,
      difference: quota.usedQuota - expected,
    });
  }

  // Baris history dengan baseline mustahil: `newQuota`/`previousQuota` lebih besar
  // dari total kuota jenis cuti itu (angkanya warisan kuota tahunan generik).
  const totalQuotaByType = new Map<string, number>();
  for (const quota of quotas) {
    const key = `${quota.userId}|${quota.leaveTypeId}`;
    totalQuotaByType.set(key, Math.max(totalQuotaByType.get(key) ?? 0, quota.totalQuota));
  }

  const histories = await client.leaveQuotaHistory.findMany({
    where: { leaveTypeId: { not: null } },
    include: { user: { select: { name: true } }, leaveType: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const legacyBaselineRows: LegacyBaselineRow[] = [];
  const acknowledgedLegacyRows: LegacyBaselineRow[] = [];
  for (const row of histories) {
    if (!row.leaveTypeId || !row.leaveType) continue;
    const totalQuota = totalQuotaByType.get(`${row.userId}|${row.leaveTypeId}`);
    if (totalQuota === undefined || totalQuota >= UNLIMITED_QUOTA_THRESHOLD) continue;
    if (row.newQuota <= totalQuota && row.previousQuota <= totalQuota) continue;
    const entry: LegacyBaselineRow = {
      id: row.id,
      userId: row.userId,
      userName: row.user.name,
      leaveTypeId: row.leaveTypeId,
      leaveTypeName: row.leaveType.name,
      leaveRequestId: row.leaveRequestId,
      previousQuota: row.previousQuota,
      changeAmount: row.changeAmount,
      newQuota: row.newQuota,
      totalQuota,
      description: row.description,
    };
    // Baris yang sudah ditandai & dikoreksi tetap ada sebagai audit trail, bukan drift.
    if (row.description?.includes(LEGACY_BASELINE_MARKER)) acknowledgedLegacyRows.push(entry);
    else legacyBaselineRows.push(entry);
  }

  return { usedQuotaDrift, genericQuotaDrift, legacyBaselineRows, acknowledgedLegacyRows };
}

function formatReport(report: QuotaConsistencyReport): string[] {
  const lines: string[] = [];
  lines.push(`  user_leave_quotas drift        : ${report.usedQuotaDrift.length} baris`);
  for (const row of report.usedQuotaDrift) {
    lines.push(
      `    - ${row.userName} / ${row.leaveTypeName} (${row.year}): usedQuota ${row.storedUsedQuota} → ${row.expectedUsedQuota} (selisih ${row.difference})`
    );
  }
  lines.push(`  leave_quotas (generik) drift   : ${report.genericQuotaDrift.length} baris`);
  for (const row of report.genericQuotaDrift) {
    lines.push(
      `    - ${row.userName}: usedQuota ${row.storedUsedQuota} → ${row.expectedUsedQuota} (selisih ${row.difference})`
    );
  }
  lines.push(`  history baseline legacy        : ${report.legacyBaselineRows.length} baris`);
  for (const row of report.legacyBaselineRows) {
    lines.push(
      `    - ${row.userName} / ${row.leaveTypeName}: prev=${row.previousQuota} chg=${row.changeAmount} new=${row.newQuota} (total kuota jenis ${row.totalQuota}) history=${row.id}`
    );
  }
  if (report.acknowledgedLegacyRows.length > 0) {
    lines.push(`  (sudah ditandai & dikoreksi)   : ${report.acknowledgedLegacyRows.length} baris (audit trail, diabaikan)`);
  }
  return lines;
}

/**
 * Perbaiki seluruh drift dalam satu transaksi:
 * 1. `user_leave_quotas.usedQuota` disamakan dengan hari segmen APPROVED/DONE (+ baris history).
 * 2. `leave_quotas.usedQuota` (generik) = hari Cuti Tahunan APPROVED/DONE saja.
 * 3. Baris history ber-baseline mustahil tidak dihapus, hanya ditandai + dibuat baris koreksi.
 *
 * Idempoten: dijalankan ulang tanpa drift tidak menulis apa pun.
 */
export async function reconcileQuota(
  options: { dryRun?: boolean; log?: (line: string) => void } = {}
): Promise<ReconcileResult> {
  const log = options.log ?? (() => {});
  const changes: ReconcileChanges = {
    usedQuotaUpdated: [],
    genericQuotaUpdated: [],
    legacyRowsMarked: [],
    legacyCorrectionsCreated: [],
  };

  const before = await auditQuotaConsistency();

  if (options.dryRun) {
    const after = await auditQuotaConsistency();
    return { before, after, changes };
  }

  await prisma.$transaction(
    async (tx) => {
      // ---------------------------------------------------------------- 1. per jenis cuti
      const approved = await collectApprovedDaysByType(tx);
      const approvedMap = approvedDaysMap(approved);

      const quotas = await tx.userLeaveQuota.findMany({
        include: { user: { select: { name: true } }, leaveType: { select: { id: true, name: true } } },
        orderBy: [{ userId: 'asc' }, { leaveTypeId: 'asc' }, { year: 'asc' }],
      });

      for (const quota of quotas) {
        const expected = approvedMap.get(`${quota.userId}|${quota.leaveTypeId}`) ?? 0;
        if (quota.usedQuota === expected) continue;

        const previousRemaining = quota.totalQuota - quota.usedQuota;
        const changeAmount = quota.usedQuota - expected; // positif = kuota dikembalikan
        const newRemaining = quota.totalQuota - expected;

        log(
          `[per jenis] ${quota.user.name} / ${quota.leaveType.name} (${quota.year}): usedQuota ${quota.usedQuota} → ${expected}`
        );

        await tx.userLeaveQuota.update({ where: { id: quota.id }, data: { usedQuota: expected } });

        await tx.leaveQuotaHistory.create({
          data: {
            userId: quota.userId,
            leaveRequestId: null,
            leaveTypeId: quota.leaveTypeId,
            previousQuota: previousRemaining,
            changeAmount,
            newQuota: newRemaining,
            type: QuotaHistoryType.ADMIN_MANUAL_ADJUSTMENT,
            description: `Rekonsiliasi otomatis: usedQuota ${quota.usedQuota} → ${expected} (sumber: segmen pengajuan APPROVED/DONE)`,
          },
        });

        changes.usedQuotaUpdated.push({
          userName: quota.user.name,
          leaveTypeName: quota.leaveType.name,
          year: quota.year,
          from: quota.usedQuota,
          to: expected,
        });
      }

      // ------------------------------------------------- 2. kuota tahunan generik (Cuti Tahunan)
      const annualTypes = await tx.leaveType.findMany({
        where: { name: ANNUAL_LEAVE_NAME },
        select: { id: true },
      });
      const annualTypeIds = new Set(annualTypes.map((type) => type.id));

      const annualDaysByUser = new Map<string, number>();
      for (const row of approved) {
        if (!annualTypeIds.has(row.leaveTypeId)) continue;
        annualDaysByUser.set(row.userId, (annualDaysByUser.get(row.userId) ?? 0) + row.days);
      }

      const genericQuotas = await tx.leaveQuota.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { userId: 'asc' },
      });

      for (const quota of genericQuotas) {
        const expected = annualDaysByUser.get(quota.userId) ?? 0;
        if (quota.usedQuota === expected) continue;

        log(`[generik] ${quota.user.name}: usedQuota ${quota.usedQuota} → ${expected}`);

        await tx.leaveQuota.update({ where: { id: quota.id }, data: { usedQuota: expected } });

        // `leaveTypeId: null` — baris ini milik kuota tahunan generik, bukan kuota per jenis cuti.
        await tx.leaveQuotaHistory.create({
          data: {
            userId: quota.userId,
            leaveRequestId: null,
            leaveTypeId: null,
            previousQuota: quota.totalQuota - quota.usedQuota,
            changeAmount: quota.usedQuota - expected,
            newQuota: quota.totalQuota - expected,
            type: QuotaHistoryType.ADMIN_MANUAL_ADJUSTMENT,
            description: `Rekonsiliasi otomatis (kuota tahunan generik): usedQuota ${quota.usedQuota} → ${expected} — hanya ${ANNUAL_LEAVE_NAME} yang memotong kuota tahunan`,
          },
        });

        changes.genericQuotaUpdated.push({ userName: quota.user.name, from: quota.usedQuota, to: expected });
      }

      // ------------------------------------------------------ 3. history ber-baseline mustahil
      const totalQuotaByType = new Map<string, number>();
      for (const quota of await tx.userLeaveQuota.findMany({
        select: { userId: true, leaveTypeId: true, totalQuota: true },
      })) {
        const key = `${quota.userId}|${quota.leaveTypeId}`;
        totalQuotaByType.set(key, Math.max(totalQuotaByType.get(key) ?? 0, quota.totalQuota));
      }

      const legacyRows = await tx.leaveQuotaHistory.findMany({
        where: { leaveTypeId: { not: null } },
        include: { user: { select: { name: true } }, leaveType: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      });

      for (const row of legacyRows) {
        if (!row.leaveTypeId || !row.leaveType) continue;
        const key = `${row.userId}|${row.leaveTypeId}`;
        const totalQuota = totalQuotaByType.get(key);
        if (totalQuota === undefined || totalQuota >= UNLIMITED_QUOTA_THRESHOLD) continue;
        if (row.newQuota <= totalQuota && row.previousQuota <= totalQuota) continue;

        if (!row.description?.includes(LEGACY_BASELINE_MARKER)) {
          log(
            `[history] ${row.user.name} / ${row.leaveType.name}: tandai baseline legacy (prev=${row.previousQuota} new=${row.newQuota}, total kuota jenis ${totalQuota})`
          );
          await tx.leaveQuotaHistory.update({
            where: { id: row.id },
            data: {
              description: `${row.description ?? ''} ${LEGACY_BASELINE_MARKER}`.trim(),
            },
          });
          changes.legacyRowsMarked.push({
            userName: row.user.name,
            leaveTypeName: row.leaveType.name,
            historyId: row.id,
          });
        }

        // Baris koreksi (baris lama tetap ada → audit trail utuh).
        // `leaveRequestId: null` supaya koreksi ini tidak dihitung sebagai pemotongan pengajuan.
        const correctionExists = await tx.leaveQuotaHistory.findFirst({
          where: {
            userId: row.userId,
            leaveTypeId: row.leaveTypeId,
            type: QuotaHistoryType.ADMIN_MANUAL_ADJUSTMENT,
            description: { startsWith: LEGACY_CORRECTION_PREFIX },
          },
          select: { id: true },
        });
        if (correctionExists) continue;

        const typeQuota = await tx.userLeaveQuota.findFirst({
          where: { userId: row.userId, leaveTypeId: row.leaveTypeId },
          orderBy: { year: 'desc' },
          select: { totalQuota: true, usedQuota: true },
        });
        const usedAfter = typeQuota ? typeQuota.usedQuota : 0;
        const totalAfter = typeQuota ? typeQuota.totalQuota : totalQuota;

        log(
          `[history] ${row.user.name} / ${row.leaveType.name}: buat baris koreksi (baseline benar ${totalAfter} hari, sisa ${totalAfter - usedAfter})`
        );

        const correction = await tx.leaveQuotaHistory.create({
          data: {
            userId: row.userId,
            leaveRequestId: null,
            leaveTypeId: row.leaveTypeId,
            previousQuota: totalAfter,
            changeAmount: -Math.min(usedAfter, totalAfter),
            newQuota: totalAfter - Math.min(usedAfter, totalAfter),
            type: QuotaHistoryType.ADMIN_MANUAL_ADJUSTMENT,
            description: `${LEGACY_CORRECTION_PREFIX} baris ${row.id} memakai baseline kuota tahunan generik (prev=${row.previousQuota}, new=${row.newQuota}) padahal kuota jenis ${row.leaveType.name} hanya ${totalAfter} hari. Pemotongan yang benar dihitung dari total kuota jenis: ${totalAfter} → ${totalAfter - Math.min(usedAfter, totalAfter)} (${usedAfter} hari terpakai).`,
          },
        });
        changes.legacyCorrectionsCreated.push({
          userName: row.user.name,
          leaveTypeName: row.leaveType.name,
          historyId: correction.id,
        });
      }
    },
    { timeout: 30_000 }
  );

  const after = await auditQuotaConsistency();
  return { before, after, changes };
}

export { formatReport };
