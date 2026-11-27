import { randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api-error';

/**
 * Klien tipis Google Drive khusus untuk mengarsipkan PDF bertanda tangan.
 *
 * Kenapa tidak pakai `googleapis`: paket itu besar dan task ini hanya butuh tiga
 * panggilan (upload multipart, set permission, hapus file). Cukup `fetch` bawaan Node.
 *
 * Kenapa OAuth2 refresh token (bukan service account): service account tidak
 * punya storage quota sendiri, jadi upload ke folder My Drive akun personal
 * selalu ditolak Google dengan `403 Service Accounts do not have storage quota`.
 * Karena itu autentikasi memakai akun user pemilik folder lewat refresh token:
 *   1. POST oauth2.googleapis.com/token (grant_type=refresh_token) → access_token,
 *   2. upload multipart/related ke Drive,
 *   3. set permission "anyone with link, reader" supaya link bisa dibuka.
 *
 * Token OAuth di-cache di memori proses sampai 5 menit sebelum kedaluwarsa
 * supaya satu request upload tidak selalu membayar biaya token exchange.
 */

const DEFAULT_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_API_BASE = 'https://www.googleapis.com';

/** Token dipakai ulang sampai 5 menit sebelum `expires_in` habis. */
const TOKEN_SAFETY_MS = 5 * 60 * 1000;
/** Batas atas ukuran PDF yang diterima (10 MB). */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

interface TokenCacheEntry {
  accessToken: string;
  /** Epoch ms kapan token benar-benar kedaluwarsa (bukan versi aman). */
  expiresAt: number;
}

export interface DriveUploadResult {
  id: string;
  fileName: string;
  webViewLink: string;
  sizeBytes: number;
  mimeType: string;
}

let tokenCache: TokenCacheEntry | null = null;

/** URL token OAuth (bisa di-override untuk pengujian lokal dengan stub). */
function tokenUrl(): string {
  return process.env.GOOGLE_OAUTH_TOKEN_URL?.trim() || DEFAULT_TOKEN_URL;
}

/** Base URL API Google (bisa di-override untuk pengujian lokal dengan stub). */
function apiBaseUrl(): string {
  return (process.env.GDRIVE_API_BASE_URL?.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
}

/** ID folder Drive tujuan semua dokumen; wajib diisi di env. */
export function getDriveFolderId(): string {
  const folderId = process.env.GDRIVE_FOLDER_ID?.trim();
  if (!folderId) {
    throw new ApiError(
      'Google Drive belum dikonfigurasi: env GDRIVE_FOLDER_ID kosong',
      500
    );
  }
  return folderId;
}

/** Folder arsip laporan bulanan (terpisah dari folder dokumen bertanda tangan). */
export function getLaporanFolderId(): string {
  const folderId =
    process.env.GDRIVE_LAPORAN_FOLDER_ID?.trim() || process.env.GDRIVE_FOLDER_ID?.trim();
  if (!folderId) {
    throw new ApiError(
      'Google Drive belum dikonfigurasi: env GDRIVE_LAPORAN_FOLDER_ID kosong',
      500
    );
  }
  return folderId;
}

/**
 * Baca & validasi kredensial OAuth dari env. Pesan error hanya menyebut NAMA
 * env yang kosong — nilai credential tidak pernah ikut di pesan/log.
 */
function loadCredentials(): OAuthCredentials {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();

  const missing = [
    !clientId && 'GOOGLE_OAUTH_CLIENT_ID',
    !clientSecret && 'GOOGLE_OAUTH_CLIENT_SECRET',
    !refreshToken && 'GOOGLE_OAUTH_REFRESH_TOKEN',
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new ApiError(
      `Google Drive belum dikonfigurasi: env ${missing.join(', ')} kosong`,
      500
    );
  }

  return {
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    refreshToken: refreshToken as string,
  };
}

/** Tukar refresh token dengan access token OAuth (dengan cache di memori). */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt - TOKEN_SAFETY_MS > now) {
    return tokenCache.accessToken;
  }

  const credentials = loadCredentials();

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: credentials.refreshToken,
  });

  let response: Response;
  try {
    response = await fetch(tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    throw new ApiError('Tidak bisa menghubungi server OAuth Google (jaringan)', 502);
  }

  const text = await response.text();
  let payload: {
    access_token?: unknown;
    expires_in?: unknown;
    error?: unknown;
    error_description?: unknown;
  } = {};
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    // Biarkan payload kosong; ditangani di bawah.
  }

  if (!response.ok) {
    const code = typeof payload.error === 'string' ? payload.error : undefined;
    const detail =
      typeof payload.error_description === 'string'
        ? ` (${payload.error_description.slice(0, 160)})`
        : '';
    throw new ApiError(
      `Autentikasi Google Drive gagal (HTTP ${response.status}${code ? `: ${code}` : ''})${detail}`,
      502
    );
  }

  const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
  if (!accessToken) {
    throw new ApiError('Respons OAuth Google tidak berisi access_token', 502);
  }

  const expiresIn = Number(payload.expires_in);
  const lifetimeMs = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 3600 * 1000;
  tokenCache = { accessToken, expiresAt: now + lifetimeMs };

  return accessToken;
}

/**
 * Set permission "anyone with link, reader" supaya `webViewLink` bisa dibuka
 * siapa pun yang punya link (tanpa login Google).
 */
async function setAnyoneWithLinkReader(accessToken: string, fileId: string): Promise<void> {
  const url = `${apiBaseUrl()}/drive/v3/files/${encodeURIComponent(fileId)}/permissions`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
  } catch {
    throw new ApiError('File terunggah tetapi gagal menghubungi Google untuk set permission', 502);
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new ApiError(
      `File terunggah (id ${fileId}) tetapi gagal dijadikan "anyone with link" (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
      502
    );
  }
}

/**
 * Upload file (PDF/DOCX/…) ke folder Drive tujuan, lalu set permission publik.
 * Body memakai `multipart/related` (metadata JSON + bytes file) sesuai
 * dokumentasi Drive `uploadType=multipart`.
 *
 * @param folderId override folder (default `GDRIVE_FOLDER_ID`).
 */
export async function uploadFileToDrive(
  fileName: string,
  bytes: Uint8Array,
  mimeType = 'application/pdf',
  folderId?: string
): Promise<DriveUploadResult> {
  if (bytes.length === 0) {
    throw new ApiError('File kosong', 400);
  }
  if (bytes.length > MAX_PDF_BYTES) {
    throw new ApiError('Ukuran file melebihi 10 MB', 413);
  }

  const targetFolderId = folderId?.trim() || getDriveFolderId();
  const accessToken = await getAccessToken();

  const boundary = `besthcm_${randomUUID()}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [targetFolderId],
    mimeType,
  });

  const head = Buffer.from(
    `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    'utf8'
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, Buffer.from(bytes), tail]);

  const url =
    `${apiBaseUrl()}/upload/drive/v3/files?uploadType=multipart` +
    '&fields=id,name,webViewLink,size,mimeType';

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body,
    });
  } catch {
    throw new ApiError('Tidak bisa menghubungi Google Drive untuk upload file', 502);
  }

  const text = await response.text();
  let payload: {
    id?: unknown;
    name?: unknown;
    webViewLink?: unknown;
    size?: unknown;
    mimeType?: unknown;
    error?: { message?: unknown; status?: unknown };
  } = {};
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    // ditangani di bawah
  }

  if (!response.ok) {
    const detail =
      typeof payload.error?.message === 'string'
        ? `: ${payload.error.message.slice(0, 200)}`
        : '';
    throw new ApiError(`Upload ke Google Drive gagal (HTTP ${response.status})${detail}`, 502);
  }

  const fileId = typeof payload.id === 'string' ? payload.id : '';
  if (!fileId) {
    throw new ApiError('Respons Google Drive tidak berisi id file', 502);
  }

  const resolvedName = typeof payload.name === 'string' && payload.name ? payload.name : fileName;
  const webViewLink =
    typeof payload.webViewLink === 'string' && payload.webViewLink
      ? payload.webViewLink
      : `https://drive.google.com/file/d/${fileId}/view`;
  const sizeBytes = Number(payload.size);
  const resolvedMimeType =
    typeof payload.mimeType === 'string' && payload.mimeType ? payload.mimeType : mimeType;

  await setAnyoneWithLinkReader(accessToken, fileId);

  return {
    id: fileId,
    fileName: resolvedName,
    webViewLink,
    sizeBytes: Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : bytes.length,
    mimeType: resolvedMimeType,
  };
}

export interface DriveDeleteResult {
  /** `true` = file benar-benar dihapus pada panggilan ini. */
  deleted: boolean;
  /** `true` = Drive menjawab 404 (file sudah tidak ada) — diperlakukan sukses. */
  alreadyGone: boolean;
}

/**
 * Hapus satu file Drive berdasarkan id.
 *
 * `404` bukan error: file memang sudah tidak ada (mis. dihapus manual), jadi
 * operasi tetap dianggap sukses supaya pemanggil bisa idempotent. Status lain
 * (401/403/5xx) dilempar sebagai `ApiError` 502 agar pemanggil tahu file masih
 * ada di Drive dan bisa membatalkan perubahan DB.
 *
 * `supportsAllDrives` sengaja tidak dipakai: file berada di My Drive akun user,
 * bukan shared drive.
 */
export async function deleteDriveFile(fileId: string): Promise<DriveDeleteResult> {
  const id = (fileId ?? '').trim();
  if (!id) {
    throw new ApiError('driveFileId kosong, tidak ada file yang bisa dihapus', 500);
  }

  const accessToken = await getAccessToken();
  const url = `${apiBaseUrl()}/drive/v3/files/${encodeURIComponent(id)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new ApiError('Tidak bisa menghubungi Google Drive untuk menghapus file', 502);
  }

  // Drive menjawab 204 No Content saat berhasil menghapus.
  if (response.status === 204 || response.status === 200) {
    return { deleted: true, alreadyGone: false };
  }
  if (response.status === 404) {
    return { deleted: false, alreadyGone: true };
  }

  const detail = (await response.text()).slice(0, 200);
  throw new ApiError(
    `Hapus file Google Drive gagal (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
    502
  );
}

/**
 * Ganti nama file Drive (dipakai saat versi laporan dinaikkan: file lama
 * dipertahankan sebagai riwayat dengan akhiran `_v<versi>`).
 *
 * `404` dilempar sebagai ApiError 404 supaya pemanggil tahu file arsip hilang.
 */
export async function renameDriveFile(fileId: string, newName: string): Promise<{ id: string; name: string }> {
  const id = (fileId ?? '').trim();
  const name = (newName ?? '').trim();
  if (!id) throw new ApiError('driveFileId kosong, tidak ada file yang bisa diganti nama', 500);
  if (!name) throw new ApiError('Nama file Drive baru kosong', 400);

  const accessToken = await getAccessToken();
  const url = `${apiBaseUrl()}/drive/v3/files/${encodeURIComponent(id)}?fields=id,name`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });
  } catch {
    throw new ApiError('Tidak bisa menghubungi Google Drive untuk mengganti nama file', 502);
  }

  const text = await response.text();
  let payload: { id?: unknown; name?: unknown; error?: { message?: unknown } } = {};
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    // ditangani di bawah
  }

  if (response.status === 404) {
    throw new ApiError('File arsip tidak ditemukan di Google Drive', 404);
  }
  if (!response.ok) {
    const detail =
      typeof payload.error?.message === 'string' ? `: ${payload.error.message.slice(0, 200)}` : '';
    throw new ApiError(`Ganti nama file Google Drive gagal (HTTP ${response.status})${detail}`, 502);
  }

  return {
    id: typeof payload.id === 'string' && payload.id ? payload.id : id,
    name: typeof payload.name === 'string' && payload.name ? payload.name : name,
  };
}

/** Kompatibilitas pemanggil lama (arsip PDF bertanda tangan). */
export async function uploadPdfToDrive(
  fileName: string,
  bytes: Uint8Array,
  mimeType = 'application/pdf'
): Promise<DriveUploadResult> {
  return uploadFileToDrive(fileName, bytes, mimeType);
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  webViewLink: string;
}

/**
 * Daftar file di satu folder Drive (dipakai untuk verifikasi arsip laporan).
 * `name` opsional untuk mencari file dengan nama persis.
 */
export async function listDriveFiles(folderId: string, name?: string): Promise<DriveFileInfo[]> {
  const accessToken = await getAccessToken();
  const parent = folderId.trim();
  if (!parent) throw new ApiError('folderId Drive kosong', 500);

  let query = `'${parent.replace(/'/g, "\\'")}' in parents and trashed = false`;
  if (name) query += ` and name = '${name.replace(/'/g, "\\'")}'`;

  const url =
    `${apiBaseUrl()}/drive/v3/files?q=${encodeURIComponent(query)}` +
    '&fields=files(id,name,mimeType,size,webViewLink)&pageSize=50';

  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new ApiError('Tidak bisa menghubungi Google Drive untuk melihat daftar file', 502);
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200);
    throw new ApiError(
      `Gagal membaca daftar file Drive (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
      502
    );
  }

  const payload = (await response.json()) as {
    files?: { id?: string; name?: string; mimeType?: string; size?: string; webViewLink?: string }[];
  };

  return (payload.files ?? [])
    .filter((file) => typeof file.id === 'string' && file.id.length > 0)
    .map((file) => ({
      id: file.id as string,
      name: typeof file.name === 'string' ? file.name : '',
      mimeType: typeof file.mimeType === 'string' ? file.mimeType : '',
      sizeBytes: Number(file.size) || 0,
      webViewLink:
        typeof file.webViewLink === 'string' && file.webViewLink
          ? file.webViewLink
          : `https://drive.google.com/file/d/${file.id}/view`,
    }));
}
