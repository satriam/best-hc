import { Prisma, Role, SignedDocumentEntityType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ApiError, isApiError } from '@/lib/api-error';
import { MAX_PDF_BYTES, uploadPdfToDrive } from '@/services/google-drive.service';

/**
 * Arsip PDF bertanda tangan untuk SPKL & Pengajuan Cuti.
 *
 * File fisik disimpan di satu folder Google Drive; tabel `signed_documents`
 * hanya menyimpan metadata + link. Satu entity hanya punya SATU dokumen aktif:
 * upload baru menonaktifkan baris lama (`isActive = false`, tetap tersimpan
 * sebagai riwayat, file Drive lama dibiarkan).
 */

export { MAX_PDF_BYTES };

export interface SignedDocumentActor {
  id: string;
  role: Role;
}

export interface SignedDocumentDto {
  id: string;
  entityType: SignedDocumentEntityType;
  entityId: string;
  fileName: string;
  driveFileId: string;
  driveWebViewLink: string;
  mimeType: string;
  sizeBytes: number;
  isActive: boolean;
  createdAt: Date;
  uploadedBy?: { id: string; name: string } | null;
}

export interface UploadSignedDocumentInput {
  entityType: SignedDocumentEntityType;
  entityId: string;
  actor: SignedDocumentActor;
  bytes: Uint8Array;
  mimeType: string;
}

const ENTITY_TYPES: SignedDocumentEntityType[] = ['SPKL', 'LEAVE_REQUEST'];

/** `spkl` / `leave_request` (huruf kecil) tetap diterima, sisanya 400. */
export function parseEntityType(raw: string): SignedDocumentEntityType {
  const normalized = (raw ?? '').trim().toUpperCase();
  if ((ENTITY_TYPES as string[]).includes(normalized)) {
    return normalized as SignedDocumentEntityType;
  }
  throw new ApiError('entityType harus SPKL atau LEAVE_REQUEST', 400);
}

/** PDF selalu diawali magic bytes `%PDF-` (5 byte pertama). */
export function isPdfMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d //    -
  );
}

/**
 * Sanitasi satu bagian nama file: spasi → `_`, buang karakter yang tidak aman
 * untuk nama file Drive (`/ \ : * ? " < > |`).
 */
export function sanitizeFilePart(value: string): string {
  return (value ?? '')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '')
    .slice(0, 120);
}

/** `YYYY-MM-DD` untuk tanggal yang disimpan sebagai UTC midnight. */
function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` hari ini menurut zona waktu kantor (WIB). */
function todayKeyJakarta(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** `SPKL-<number>-<YYYY-MM-DD>.pdf` (tanggal = tanggal arsip dibuat). */
export function buildSpklFileName(spklNumber: string): string {
  const number = sanitizeFilePart(spklNumber) || 'TANPA_NOMOR';
  return `SPKL-${number}-${todayKeyJakarta()}.pdf`;
}

/** `CUTI-<nama>-<startDate YYYY-MM-DD>.pdf`. */
export function buildLeaveFileName(employeeName: string, startDate: Date): string {
  const name = sanitizeFilePart(employeeName) || 'KARYAWAN';
  return `CUTI-${name}-${toDateKey(startDate)}.pdf`;
}

const dtoSelect = {
  id: true,
  entityType: true,
  entityId: true,
  fileName: true,
  driveFileId: true,
  driveWebViewLink: true,
  mimeType: true,
  sizeBytes: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.SignedDocumentSelect;

/** Pastikan entity tujuan ada dan belum dihapus; sekaligus ambil data untuk nama file. */
async function resolveEntityFileName(
  entityType: SignedDocumentEntityType,
  entityId: string
): Promise<string> {
  if (entityType === 'SPKL') {
    const spkl = await prisma.spkl.findFirst({
      where: { id: entityId, deletedAt: null },
      select: { id: true, number: true },
    });
    if (!spkl) throw new ApiError('SPKL tidak ditemukan', 404);
    return buildSpklFileName(spkl.number);
  }

  const leaveRequest = await prisma.leaveRequest.findFirst({
    where: { id: entityId, deletedAt: null },
    select: { id: true, startDate: true, user: { select: { name: true } } },
  });
  if (!leaveRequest) throw new ApiError('Pengajuan cuti tidak ditemukan', 404);
  return buildLeaveFileName(leaveRequest.user?.name ?? '', leaveRequest.startDate);
}

/**
 * Upload PDF ke Drive lalu simpan metadatanya.
 *
 * Urutan sengaja: Drive dulu, DB belakangan. Kalau DB gagal setelah Drive
 * sukses, error dilaporkan apa adanya (file jadi orphan di Drive, tapi data
 * tidak pernah menunjuk file yang tidak ada).
 */
export async function uploadSignedDocument(
  input: UploadSignedDocumentInput
): Promise<SignedDocumentDto> {
  const { entityType, entityId, actor, bytes, mimeType } = input;

  if (actor.role !== 'ADMIN') {
    throw new ApiError('Hanya admin yang boleh mengunggah dokumen', 403);
  }
  if (bytes.length === 0) {
    throw new ApiError('File kosong', 400);
  }
  if (bytes.length > MAX_PDF_BYTES) {
    throw new ApiError('Ukuran file melebihi 10 MB', 413);
  }
  if (mimeType !== 'application/pdf') {
    throw new ApiError('File bukan PDF', 400);
  }
  if (!isPdfMagicBytes(bytes)) {
    throw new ApiError('File bukan PDF (isi file tidak diawali %PDF-)', 400);
  }

  const fileName = await resolveEntityFileName(entityType, entityId);

  let uploaded;
  try {
    uploaded = await uploadPdfToDrive(fileName, bytes, 'application/pdf');
  } catch (error) {
    if (isApiError(error)) throw error;
    throw new ApiError('Gagal mengunggah file ke Google Drive', 502);
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      await tx.signedDocument.updateMany({
        where: { entityType, entityId, isActive: true },
        data: { isActive: false },
      });

      return tx.signedDocument.create({
        data: {
          entityType,
          entityId,
          fileName: uploaded.fileName,
          driveFileId: uploaded.id,
          driveWebViewLink: uploaded.webViewLink,
          mimeType: uploaded.mimeType || 'application/pdf',
          sizeBytes: uploaded.sizeBytes,
          uploadedById: actor.id,
          isActive: true,
        },
        select: dtoSelect,
      });
    });

    return created;
  } catch (error) {
    console.error('[signed-document] metadata gagal disimpan setelah upload Drive', {
      entityType,
      entityId,
      driveFileId: uploaded.id,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    throw new ApiError(
      `File sudah terunggah ke Google Drive (id ${uploaded.id}) tetapi metadata gagal disimpan. ` +
        'File di Drive perlu dibersihkan manual oleh admin.',
      500
    );
  }
}

/** Daftar dokumen entity (terbaru dulu), termasuk riwayat non-aktif. */
export async function listSignedDocuments(
  entityType: SignedDocumentEntityType,
  entityId: string
): Promise<SignedDocumentDto[]> {
  return prisma.signedDocument.findMany({
    where: { entityType, entityId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      ...dtoSelect,
      uploadedBy: { select: { id: true, name: true } },
    },
  });
}

/** Soft delete: baris ditandai `deletedAt` + `isActive = false`, file Drive dibiarkan. */
export async function deleteSignedDocument(
  entityType: SignedDocumentEntityType,
  entityId: string,
  docId: string,
  actor: SignedDocumentActor
): Promise<{ id: string; driveFileId: string }> {
  if (actor.role !== 'ADMIN') {
    throw new ApiError('Hanya admin yang boleh menghapus dokumen', 403);
  }

  const existing = await prisma.signedDocument.findFirst({
    where: { id: docId, entityType, entityId, deletedAt: null },
    select: { id: true, driveFileId: true },
  });

  if (!existing) {
    throw new ApiError('Dokumen tidak ditemukan', 404);
  }

  await prisma.signedDocument.update({
    where: { id: existing.id },
    data: { isActive: false, deletedAt: new Date() },
  });

  return { id: existing.id, driveFileId: existing.driveFileId };
}
