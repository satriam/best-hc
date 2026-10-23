import { Prisma, Role, SignedDocumentEntityType } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ApiError, isApiError } from '@/lib/api-error';
import { MAX_PDF_BYTES, deleteDriveFile, uploadPdfToDrive } from '@/services/google-drive.service';

/**
 * Arsip PDF bertanda tangan untuk SPKL & Pengajuan Cuti.
 *
 * File fisik disimpan di satu folder Google Drive; tabel `signed_documents`
 * hanya menyimpan metadata + link. Satu entity hanya punya SATU dokumen aktif:
 * upload baru menonaktifkan baris lama, dan **file Drive lama ikut dihapus**
 * supaya satu record = satu file (tidak ada file yatim di Drive).
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

export interface UploadSignedDocumentResult {
  document: SignedDocumentDto;
  /** Masalah non-fatal (mis. file lama gagal dihapus dari Drive) — data sudah benar. */
  warnings: string[];
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
 * Urutan (sengaja, jangan dibalik):
 *   1. Upload file baru ke Drive.
 *   2. Transaksi DB: dokumen lama entity ini `isActive = false` + `create` baru.
 *   3. Setelah transaksi sukses, hapus file Drive lama.
 *
 * Kalau langkah 3 gagal, request TIDAK digagalkan (data sudah benar) — file
 * lama dilaporkan lewat `warnings` supaya bisa dibersihkan manual. Urutan ini
 * dipilih supaya tidak pernah ada file yang hilang dari Drive sementara DB
 * masih menunjuk ke file tersebut.
 */
export async function uploadSignedDocument(
  input: UploadSignedDocumentInput
): Promise<UploadSignedDocumentResult> {
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

  let created: SignedDocumentDto;
  let superseded: { driveFileId: string }[];

  try {
    ({ created, superseded } = await prisma.$transaction(async (tx) => {
      // Dibaca di dalam transaksi supaya file yang dinonaktifkan = file yang dihapus.
      const previous = await tx.signedDocument.findMany({
        where: { entityType, entityId, isActive: true },
        select: { driveFileId: true },
      });

      await tx.signedDocument.updateMany({
        where: { entityType, entityId, isActive: true },
        data: { isActive: false },
      });

      const row = await tx.signedDocument.create({
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

      return { created: row, superseded: previous };
    }));
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

  // Langkah 3: file Drive lama dibersihkan setelah data baru tersimpan.
  const warnings: string[] = [];
  for (const old of superseded) {
    if (!old.driveFileId || old.driveFileId === created.driveFileId) continue;
    try {
      await deleteDriveFile(old.driveFileId);
    } catch (error) {
      console.error('[signed-document] file lama gagal dihapus dari Drive', {
        entityType,
        entityId,
        driveFileId: old.driveFileId,
        message: error instanceof Error ? error.message : 'unknown error',
      });
      warnings.push(`file lama gagal dihapus dari Drive: ${old.driveFileId}`);
    }
  }

  return { document: created, warnings };
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

export interface DeleteSignedDocumentResult {
  id: string;
  driveFileId: string;
  /** `true` = baris memang sudah dihapus sebelumnya (DELETE diulang, tetap sukses). */
  alreadyDeleted: boolean;
}

/**
 * Hapus dokumen: file Drive dulu, baru DB.
 *
 * Urutan ini disengaja. Kalau Drive gagal dihapus, DB TIDAK diubah (row tetap
 * aktif) sehingga user masih melihat dokumennya dan bisa mencoba lagi — tidak
 * ada baris yang menunjuk file yang masih ada maupun file yang sudah hilang.
 *
 * Idempotent: Drive `404` (file sudah tidak ada) dianggap sukses, dan DELETE
 * yang diulang untuk baris yang sudah soft-deleted juga mengembalikan sukses.
 */
export async function deleteSignedDocument(
  entityType: SignedDocumentEntityType,
  entityId: string,
  docId: string,
  actor: SignedDocumentActor
): Promise<DeleteSignedDocumentResult> {
  if (actor.role !== 'ADMIN') {
    throw new ApiError('Hanya admin yang boleh menghapus dokumen', 403);
  }

  const existing = await prisma.signedDocument.findFirst({
    where: { id: docId, entityType, entityId },
    select: { id: true, driveFileId: true, deletedAt: true },
  });

  if (!existing) {
    throw new ApiError('Dokumen tidak ditemukan', 404);
  }

  if (existing.deletedAt) {
    return { id: existing.id, driveFileId: existing.driveFileId, alreadyDeleted: true };
  }

  // Langkah 1: hapus file Drive. Gagal di sini = batalkan semuanya.
  try {
    await deleteDriveFile(existing.driveFileId);
  } catch (error) {
    console.error('[signed-document] gagal menghapus file Drive, DB tidak diubah', {
      entityType,
      entityId,
      docId: existing.id,
      driveFileId: existing.driveFileId,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    throw new ApiError(
      'Gagal menghapus file dari Google Drive, dokumen belum dihapus.',
      502
    );
  }

  // Langkah 2: baru tandai baris terhapus.
  await prisma.signedDocument.update({
    where: { id: existing.id },
    data: { isActive: false, deletedAt: new Date() },
  });

  return { id: existing.id, driveFileId: existing.driveFileId, alreadyDeleted: false };
}
