import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/api-error';
import { Prisma } from '@prisma/client';
import PizZip from 'pizzip';
import { renderLaporanDocx } from '@/lib/laporan/build-docx';
import {
  buildLaporanFileBase,
  buildLaporanFileName,
  periodLabelFromKey,
  periodLabelFromRange,
} from '@/lib/laporan/format';
import { toOfficialPayload } from '@/lib/laporan/payload';
import { deleteLaporanDocx, saveLaporanDocx } from '@/lib/laporan/storage';
import type { LaporanInput, LaporanPayload, LaporanSignerData } from '@/lib/laporan/types';
import {
  deleteDriveFile,
  getLaporanFolderId,
  listDriveFiles,
  renameDriveFile,
  uploadFileToDrive,
} from '@/services/google-drive.service';
import { getDefaultLaporanSigners, getLaporanSignerById, toSignerData } from '@/services/laporan-signer.service';

/** MIME resmi .docx (dipakai di Content-Type response & metadata Drive). */
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export interface LaporanListFilter {
  period?: string;
  status?: 'draft' | 'selesai';
}

/** Kolom ringkas untuk daftar (payload `meta` bisa berisi gambar base64 — jangan diikutkan). */
const listSelect = {
  id: true,
  period: true,
  projectName: true,
  docNo: true,
  title: true,
  version: true,
  status: true,
  itemCount: true,
  driveFileId: true,
  driveLink: true,
  needsDriveSync: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LaporanBulananSelect;

/** Bentuk slot penanda tangan dari body request (id master atau data manual). */
type SignerSlot = LaporanSignerData;

/**
 * Lengkapi data penanda tangan: bila klien hanya mengirim `{ id }`, isi nama/
 * jabatan/instansi dari master. Slot yang tidak dikirim memakai nilai payload
 * sebelumnya (saat edit) atau master default.
 */
async function resolveSigners(
  input: LaporanInput,
  previous?: LaporanPayload['signers']
): Promise<LaporanPayload['signers']> {
  const defaults = await getDefaultLaporanSigners();

  const resolve = async (
    value: SignerSlot | undefined,
    previousSlot: SignerSlot | undefined,
    fallback: LaporanSignerData | undefined
  ): Promise<LaporanSignerData | undefined> => {
    if (!value) return previousSlot ?? fallback;
    if (value.id) {
      const row = await getLaporanSignerById(value.id);
      if (!row) throw new ApiError(`Penanda tangan ${value.id} tidak ditemukan`, 404);
      const fromMaster = toSignerData(row);
      return {
        id: row.id,
        nama: value.nama?.trim() || fromMaster?.nama || '',
        jabatan: value.jabatan?.trim() || fromMaster?.jabatan || '',
        instansi: value.instansi?.trim() || fromMaster?.instansi || '',
        nip: value.nip?.trim() || fromMaster?.nip,
      };
    }
    return {
      nama: value.nama?.trim() || '',
      jabatan: value.jabatan?.trim() || '',
      instansi: value.instansi?.trim() || '',
      nip: value.nip?.trim() || undefined,
    };
  };

  return {
    dibuat: await resolve(input.signers?.dibuat, previous?.dibuat, defaults.dibuat),
    diperiksa: await resolve(input.signers?.diperiksa, previous?.diperiksa, defaults.diperiksa),
    disetujui: await resolve(input.signers?.disetujui, previous?.disetujui, defaults.disetujui),
    disetujui2: await resolve(input.signers?.disetujui2, previous?.disetujui2, defaults.disetujui2),
  };
}

function toPayload(input: LaporanInput, signers: LaporanPayload['signers']): LaporanPayload {
  const { meta } = input;
  return {
    meta: {
      ...meta,
      coverTitle: meta.coverTitle?.trim() || undefined,
      periodLabel:
        meta.periodLabel?.trim() ||
        periodLabelFromRange(meta.periodStart ?? '', meta.periodEnd ?? '') ||
        periodLabelFromKey(meta.period),
      version: meta.version?.trim() || '1.0',
    },
    items: input.items,
    signers,
    revisions: input.revisions,
    intro: input.intro,
    scope: input.scope,
  };
}

export async function listLaporan(filter: LaporanListFilter = {}) {
  return prisma.laporanBulanan.findMany({
    where: {
      ...(filter.period ? { period: filter.period } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    select: listSelect,
    orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getLaporanById(id: string, options: { withPayload?: boolean } = {}) {
  const row = await prisma.laporanBulanan.findUnique({
    where: { id },
    ...(options.withPayload ? {} : { select: listSelect }),
  });
  if (!row) throw new ApiError('Laporan tidak ditemukan', 404);
  return row;
}

/**
 * Detail siap-edit: baris DB + payload tersimpan (bentuk internal) + payload
 * resmi datar (`payload`) + `needsDriveSync`.
 */
export async function getLaporanDetail(id: string) {
  const row = await prisma.laporanBulanan.findUnique({ where: { id } });
  if (!row) throw new ApiError('Laporan tidak ditemukan', 404);

  const stored = row.meta as unknown as LaporanPayload | null;
  const hasPayload = Boolean(stored && typeof stored === 'object' && !Array.isArray(stored));

  const { meta, ...rest } = row;
  return {
    ...rest,
    meta: hasPayload ? stored : null,
    ...(hasPayload ? { payload: toOfficialPayload(stored as LaporanPayload) } : {}),
    needsDriveSync: row.needsDriveSync,
  };
}

/** Payload tersimpan (`meta`) — dipakai untuk generate ulang saat arsip ke Drive. */
export function readPayload(meta: Prisma.JsonValue | null): LaporanPayload {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new ApiError('Data laporan tersimpan tidak lengkap, silakan generate ulang dari form', 409);
  }
  return meta as unknown as LaporanPayload;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Generate .docx lalu simpan sebagai draft.
 *
 * Baris dengan kunci (period + projectName + version) yang sama dipakai ulang
 * supaya unique constraint tidak pecah. Status arsip yang sudah `selesai`
 * dipertahankan, tetapi ditandai `needsDriveSync` karena dokumen berubah.
 */
export async function generateLaporan(input: LaporanInput, createdById: string | null) {
  const projectName = input.meta.project.trim();
  const version = input.meta.version?.trim() || '1.0';

  const existing = await prisma.laporanBulanan.findUnique({
    where: {
      period_projectName_version: {
        period: input.meta.period,
        projectName,
        version,
      },
    },
    select: { id: true, status: true, meta: true },
  });

  const previousPayload = existing?.meta
    ? (existing.meta as unknown as LaporanPayload)
    : undefined;

  const signers = await resolveSigners(input, previousPayload?.signers);
  const payload = toPayload(input, signers);

  const buffer = renderLaporanDocx(payload);

  const isArchived = existing?.status === 'selesai';
  const data = {
    docNo: input.meta.docNo?.trim() || null,
    title: input.meta.title.trim(),
    itemCount: input.items.length,
    status: existing?.status ?? 'draft',
    needsDriveSync: isArchived,
    meta: payload as unknown as Prisma.InputJsonValue,
    createdById: createdById ?? null,
  };

  const record = await prisma.laporanBulanan.upsert({
    where: {
      period_projectName_version: {
        period: input.meta.period,
        projectName,
        version,
      },
    },
    create: {
      period: input.meta.period,
      projectName,
      version,
      ...data,
    },
    update: data,
    select: listSelect,
  });

  const docxPath = await saveLaporanDocx(record.id, buffer);

  return { record, buffer, payload, docxPath };
}

/**
 * Simpan draft tanpa membuat berkas baru: `PUT /api/laporan/[id]`.
 *
 * Mengubah kunci periode/proyek/versi diperbolehkan selama tidak bentrok
 * dengan baris lain (kalau bentrok → 409).
 */
export async function saveLaporanDraft(id: string, input: LaporanInput) {
  const row = await prisma.laporanBulanan.findUnique({ where: { id } });
  if (!row) throw new ApiError('Laporan tidak ditemukan', 404);

  const previousPayload = row.meta ? (row.meta as unknown as LaporanPayload) : undefined;
  const signers = await resolveSigners(input, previousPayload?.signers);
  const payload = toPayload(input, signers);

  const projectName = input.meta.project.trim();
  const version = input.meta.version?.trim() || '1.0';

  try {
    return await prisma.laporanBulanan.update({
      where: { id },
      data: {
        period: input.meta.period,
        projectName,
        version,
        docNo: input.meta.docNo?.trim() || null,
        title: input.meta.title.trim(),
        itemCount: input.items.length,
        meta: payload as unknown as Prisma.InputJsonValue,
      },
      select: listSelect,
    });
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        `Sudah ada laporan untuk periode ${input.meta.period}, proyek "${projectName}", versi ${version}`,
        409
      );
    }
    throw error;
  }
}

/**
 * Bangun ulang .docx dari data tersimpan: `POST /api/laporan/[id]/generate`.
 *
 * Untuk laporan yang sudah diarsipkan (`status=selesai`), dokumen baru belum
 * ada di Drive sehingga `needsDriveSync` diset `true`.
 */
export async function regenerateLaporan(id: string) {
  const row = await prisma.laporanBulanan.findUnique({ where: { id } });
  if (!row) throw new ApiError('Laporan tidak ditemukan', 404);

  const payload = readPayload(row.meta);
  const buffer = renderLaporanDocx(payload);
  const docxPath = await saveLaporanDocx(row.id, buffer);

  const record = await prisma.laporanBulanan.update({
    where: { id },
    data: row.status === 'selesai' ? { needsDriveSync: true } : {},
    select: listSelect,
  });

  return {
    record,
    buffer,
    payload,
    docxPath,
    fileName: buildLaporanFileName(row.projectName, row.period, row.version),
  };
}

/** Versi minor berikutnya: `1.0` → `1.1`, `1.9` → `1.10`, `abc` → `1.1`. */
export function nextVersionLabel(current: string): string {
  const match = (current ?? '').trim().match(/^(\d+)(?:[.,](\d+))?$/);
  if (!match) return '1.1';
  const major = Number(match[1]);
  const minor = match[2] === undefined ? 0 : Number(match[2]);
  return `${major}.${minor + 1}`;
}

/**
 * Arsipkan laporan ke folder Drive `Laporan Bulanan`.
 *
 * - Tanpa `bumpVersion`: file arsip lama dihapus, lalu file versi yang sama
 *   diunggah ulang (satu file per periode+proyek+versi).
 * - Dengan `bumpVersion`: versi dinaikkan (`1.0` → `1.1`), file lama
 *   dipertahankan sebagai riwayat dan di-rename `_v<versi-lama>`, file baru
 *   diunggah dengan nama versi baru.
 */
export async function finalizeLaporan(id: string, options: { bumpVersion?: boolean } = {}) {
  const row = await prisma.laporanBulanan.findUnique({ where: { id } });
  if (!row) throw new ApiError('Laporan tidak ditemukan', 404);

  const payload = readPayload(row.meta);
  const bump = Boolean(options.bumpVersion);
  const previousVersion = row.version;
  const version = bump ? nextVersionLabel(previousVersion) : row.version;

  if (bump) {
    const collision = await prisma.laporanBulanan.findUnique({
      where: {
        period_projectName_version: {
          period: row.period,
          projectName: row.projectName,
          version,
        },
      },
      select: { id: true },
    });
    if (collision && collision.id !== row.id) {
      throw new ApiError(
        `Versi ${version} untuk periode ${row.period} sudah ada — hapus/ubah dulu laporan tersebut`,
        409
      );
    }
    // Judul versi baru ikut tersimpan supaya generate ulang konsisten.
    payload.meta = { ...payload.meta, version, period: row.period };
  }

  const buffer = renderLaporanDocx(payload);
  const fileName = buildLaporanFileName(row.projectName, row.period, version);
  const folderId = getLaporanFolderId();

  let previousRemoved = false;
  let previousRenamed: string | null = null;

  if (row.driveFileId) {
    if (bump) {
      const historyName = `${buildLaporanFileBase(row.projectName, row.period)}_v${previousVersion}.docx`;
      try {
        const renamed = await renameDriveFile(row.driveFileId, historyName);
        previousRenamed = renamed.name;
      } catch (error: unknown) {
        // File arsip sudah tidak ada di Drive → lanjut unggah versi baru.
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
      }
    } else {
      const result = await deleteDriveFile(row.driveFileId);
      previousRemoved = result.deleted;
    }
  }

  const uploaded = await uploadFileToDrive(fileName, buffer, DOCX_MIME, folderId);
  const docxPath = await saveLaporanDocx(row.id, buffer);

  const record = await prisma.laporanBulanan.update({
    where: { id },
    data: {
      status: 'selesai',
      version,
      needsDriveSync: false,
      driveFileId: uploaded.id,
      driveLink: uploaded.webViewLink,
      meta: payload as unknown as Prisma.InputJsonValue,
    },
    select: listSelect,
  });

  return {
    record,
    upload: uploaded,
    fileName,
    docxPath,
    previousRemoved,
    previousRenamed,
    previousVersion: bump ? previousVersion : null,
    version,
  };
}

/** Verifikasi arsip: cari file dengan nama yang sama di folder laporan. */
export async function findArchivedFile(fileName: string) {
  return listDriveFiles(getLaporanFolderId(), fileName);
}

/**
 * docx-preview 0.4.1 salah memetakan `w:textDirection="lrTb"` (teks mendatar
 * biasa) menjadi `writing-mode: vertical-lr`, sehingga isi tabel tampil
 * miring/berdiri. `lrTb` adalah nilai bawaan Word, jadi aman dibuang khusus
 * untuk pratinjau. Berkas unduhan/Drive tidak diubah.
 */
function normalizeForPreview(buffer: Buffer): Buffer {
  const zip = new PizZip(buffer);
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(name)) continue;
    const xml = zip.file(name)?.asText();
    if (!xml || !xml.includes('lrTb')) continue;
    zip.file(name, xml.replace(/<w:textDirection w:val="lrTb"\s*\/>/g, ''));
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Render .docx untuk pratinjau: tanpa menulis ke disk/DB dan tanpa menandai
 * `needsDriveSync` (beda dengan `regenerateLaporan`).
 */
export async function renderLaporanPreview(id: string) {
  const row = await prisma.laporanBulanan.findUnique({ where: { id } });
  if (!row) throw new ApiError('Laporan tidak ditemukan', 404);

  const buffer = normalizeForPreview(renderLaporanDocx(readPayload(row.meta)));
  return {
    buffer,
    fileName: buildLaporanFileName(row.projectName, row.period, row.version),
  };
}

/**
 * Hapus laporan: baris DB + berkas .docx lokal.
 *
 * Arsip Google Drive TIDAK ikut dihapus (aman & bisa dipulihkan); link Drive
 * dikembalikan supaya UI bisa memberi tahu pengguna.
 */
export async function deleteLaporan(id: string) {
  const row = await prisma.laporanBulanan.findUnique({
    where: { id },
    select: { id: true, title: true, driveLink: true },
  });
  if (!row) throw new ApiError('Laporan tidak ditemukan', 404);

  await prisma.laporanBulanan.delete({ where: { id } });
  await deleteLaporanDocx(id);

  return { id: row.id, title: row.title, driveLink: row.driveLink };
}
