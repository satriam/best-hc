/**
 * Penyimpanan berkas .docx laporan di disk: `uploads/laporan/<id>.docx`.
 *
 * File ini adalah hasil generate terakhir untuk satu laporan. UI memakai
 * `/api/laporan/[id]/generate` untuk mendapatkan berkas baru; file di disk
 * berguna sebagai bukti/arsip lokal dan untuk diagnosa tanpa Drive.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'laporan');

/** Path absolut berkas .docx terakhir untuk satu laporan. */
export function laporanDocxPath(id: string): string {
  const safe = id.replace(/[^0-9A-Za-z_-]/g, '');
  return path.join(UPLOAD_DIR, `${safe}.docx`);
}

/** Simpan (overwrite) berkas .docx terakhir; mengembalikan path absolut. */
export async function saveLaporanDocx(id: string, buffer: Buffer): Promise<string> {
  const target = laporanDocxPath(id);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return target;
}

/** Baca berkas .docx terakhir (null bila belum pernah dibuat). */
export async function readLaporanDocx(id: string): Promise<Buffer | null> {
  try {
    return await readFile(laporanDocxPath(id));
  } catch {
    return null;
  }
}

/** Hapus berkas .docx lokal (tidak error bila memang tidak ada). */
export async function deleteLaporanDocx(id: string): Promise<void> {
  await rm(laporanDocxPath(id), { force: true });
}
