import { prisma } from '@/lib/db';
import { ApiError } from '@/lib/api-error';
import { Prisma } from '@prisma/client';
import { renderLaporanDocx } from '@/lib/laporan/build-docx';
import { buildLaporanFileName, periodLabelFromKey } from '@/lib/laporan/format';
import type { LaporanPayload, LaporanSignerData } from '@/lib/laporan/types';
import type { LaporanGenerateInput } from '@/schemas/laporan.schema';
import {
  deleteDriveFile,
  getLaporanFolderId,
  listDriveFiles,
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
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LaporanBulananSelect;

/** Bentuk slot penanda tangan dari body request (id master atau data manual). */
type SignerSlot = { id?: string; nama?: string; jabatan?: string; instansi?: string; nip?: string };

/**
 * Lengkapi data penanda tangan: bila klien hanya mengirim `{ id }`, isi nama/
 * jabatan/instansi dari master. Slot yang tidak dikirim memakai master default.
 */
async function resolveSigners(input: LaporanGenerateInput): Promise<LaporanPayload['signers']> {
  const defaults = await getDefaultLaporanSigners();

  const resolve = async (
    value: SignerSlot | undefined,
    fallback: LaporanSignerData | undefined
  ): Promise<LaporanSignerData | undefined> => {
    if (!value) return fallback;
    if (value.id) {
      const row = await getLaporanSignerById(value.id);
      if (!row) throw new ApiError(`Penanda tangan ${value.id} tidak ditemukan`, 404);
      const fromMaster = toSignerData(row);
      return {
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
    dibuat: await resolve(input.signers?.dibuat, defaults.dibuat),
    diperiksa: await resolve(input.signers?.diperiksa, defaults.diperiksa),
    disetujui: await resolve(input.signers?.disetujui, defaults.disetujui),
    disetujui2: await resolve(input.signers?.disetujui2, defaults.disetujui2),
  };
}

function toPayload(input: LaporanGenerateInput, signers: LaporanPayload['signers']): LaporanPayload {
  return {
    meta: {
      ...input.meta,
      periodLabel: input.meta.periodLabel?.trim() || periodLabelFromKey(input.meta.period),
      version: input.meta.version?.trim() || '1.0',
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

/** Payload tersimpan (`meta`) — dipakai untuk generate ulang saat arsip ke Drive. */
export function readPayload(meta: Prisma.JsonValue | null): LaporanPayload {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new ApiError('Data laporan tersimpan tidak lengkap, silakan generate ulang dari form', 409);
  }
  return meta as unknown as LaporanPayload;
}

/**
 * Generate .docx lalu simpan sebagai draft.
 *
 * Baris dengan kunci (period + projectName + version) yang sama dipakai ulang
 * supaya unique constraint tidak pecah; `driveFileId` LAMA dipertahankan agar
 * `/selesai` bisa menghapus file arsip sebelumnya sebelum upload versi baru.
 */
export async function generateLaporan(input: LaporanGenerateInput, createdById: string | null) {
  const signers = await resolveSigners(input);
  const payload = toPayload(input, signers);

  const buffer = renderLaporanDocx(payload);

  const data = {
    docNo: input.meta.docNo?.trim() || null,
    title: input.meta.title.trim(),
    itemCount: input.items.length,
    status: 'draft',
    meta: payload as unknown as Prisma.InputJsonValue,
    createdById: createdById ?? null,
  };

  const record = await prisma.laporanBulanan.upsert({
    where: {
      period_projectName_version: {
        period: input.meta.period,
        projectName: input.meta.project.trim(),
        version: input.meta.version?.trim() || '1.0',
      },
    },
    create: {
      period: input.meta.period,
      projectName: input.meta.project.trim(),
      version: input.meta.version?.trim() || '1.0',
      ...data,
    },
    update: data,
    select: listSelect,
  });

  return { record, buffer, payload };
}

/**
 * Arsipkan laporan ke folder Drive `Laporan Bulanan`.
 *
 * File lama untuk dokumen yang sama dihapus lebih dulu (Drive mengizinkan nama
 * kembar, tapi arsip harus satu file per periode+proyek+versi).
 */
export async function finalizeLaporan(id: string) {
  const row = await prisma.laporanBulanan.findUnique({ where: { id } });
  if (!row) throw new ApiError('Laporan tidak ditemukan', 404);

  const payload = readPayload(row.meta);
  const buffer = renderLaporanDocx(payload);
  const fileName = buildLaporanFileName(row.projectName, row.period, row.version);
  const folderId = getLaporanFolderId();

  let previousRemoved = false;
  if (row.driveFileId) {
    const result = await deleteDriveFile(row.driveFileId);
    previousRemoved = result.deleted;
  }

  const uploaded = await uploadFileToDrive(fileName, buffer, DOCX_MIME, folderId);

  const record = await prisma.laporanBulanan.update({
    where: { id },
    data: {
      status: 'selesai',
      driveFileId: uploaded.id,
      driveLink: uploaded.webViewLink,
    },
    select: listSelect,
  });

  return { record, upload: uploaded, fileName, previousRemoved };
}

/** Verifikasi arsip: cari file dengan nama yang sama di folder laporan. */
export async function findArchivedFile(fileName: string) {
  return listDriveFiles(getLaporanFolderId(), fileName);
}
