/**
 * Fitur menu yang bisa di-assign admin per user (kolom `users.features`).
 * ADMIN selalu melihat semua fitur. Default user baru: CUTI + SPKL.
 */
export const FEATURES = [
  { key: 'CUTI', label: 'Cuti', description: 'Pengajuan dan riwayat cuti', paths: ['/leave-requests'] },
  { key: 'SPKL', label: 'SPKL', description: 'Surat perintah kerja lembur', paths: ['/spkl'] },
  { key: 'LAPORAN', label: 'Laporan Bulanan', description: 'Generate laporan bulanan', paths: ['/laporan'] },
] as const;

export type FeatureKey = (typeof FEATURES)[number]['key'];

export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[];
export const DEFAULT_FEATURES: FeatureKey[] = ['CUTI', 'SPKL'];

export function isFeatureKey(v: string): v is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(v);
}

export function hasFeature(
  user: { role: string; features?: readonly string[] | null },
  key: FeatureKey
): boolean {
  if (user.role === 'ADMIN') return true;
  return (user.features ?? []).includes(key);
}
