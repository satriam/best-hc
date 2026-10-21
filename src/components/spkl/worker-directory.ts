/**
 * "Direktori pekerja" ringan untuk form SPKL.
 *
 * Backend master pekerja (NIK → nama/jabatan) belum ada, jadi form mengingat
 * kombinasi NIK / Nama / Jabatan yang pernah dipakai user di browser ini
 * (localStorage). Tujuannya: begitu NIK dikenal, Nama & Jabatan terisi otomatis
 * dan tetap bisa diubah manual.
 *
 * Saat API master pekerja tersedia, cukup ganti `loadWorkers()` dengan fetch —
 * bentuk record (`nik`, `name`, `position`) sengaja dibuat sama.
 */

export interface WorkerRecord {
  nik: string;
  name: string;
  position: string;
}

const STORAGE_KEY = 'besthcm.spkl.worker-directory.v1';
const MAX_RECORDS = 300;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Semua pekerja yang pernah diinput di browser ini. */
export function loadWorkers(): WorkerRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is WorkerRecord =>
        Boolean(item) &&
        typeof item.nik === 'string' &&
        typeof item.name === 'string' &&
        typeof item.position === 'string'
    );
  } catch {
    return [];
  }
}

/** Simpan/segarkan record pekerja (record terakhir menang untuk NIK yang sama). */
export function rememberWorkers(records: WorkerRecord[]): void {
  if (!isBrowser()) return;

  const valid = records
    .map((record) => ({
      nik: record.nik.trim(),
      name: record.name.trim(),
      position: record.position.trim(),
    }))
    .filter((record) => record.nik.length > 0 && record.name.length > 0);

  if (valid.length === 0) return;

  const merged = new Map<string, WorkerRecord>();
  loadWorkers().forEach((record) => merged.set(record.nik, record));
  valid.forEach((record) => merged.set(record.nik, record));

  const trimmed = Array.from(merged.values()).slice(-MAX_RECORDS);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage penuh / diblokir — fitur ini hanya kenyamanan, aman diabaikan.
  }
}

/** Cari pekerja berdasarkan NIK (case-insensitive, abaikan spasi). */
export function findWorkerByNik(nik: string, workers: WorkerRecord[]): WorkerRecord | undefined {
  const key = nik.trim().toUpperCase();
  if (!key) return undefined;
  return workers.find((worker) => worker.nik.toUpperCase() === key);
}
