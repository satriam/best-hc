/**
 * Default laporan bulanan ("prefill") — kontrak dengan backend:
 *
 *   GET /api/laporan/defaults → { success, data: LaporanDefaults }
 *   PUT /api/laporan/defaults (JSON LaporanDefaults) → { success, data }
 *
 * Bila endpoint belum tersedia (404/501) UI tetap berjalan: nilai diambil dari
 * cache `localStorage` supaya prefill antar-periode masih bekerja di browser
 * yang sama, dan banner "Default belum tersedia" ditampilkan.
 */

import { buildPeriodLabel, periodKeyFromEnd } from './laporan-ui';
import type { SignerSelection } from './wizard-state';

export const DEFAULTS_CACHE_KEY = 'besthcm:laporan-defaults:v1';

export interface LaporanDefaults {
  project: string;
  coverTitle: string;
  title: string;
  docNo: string;
  spphNo: string;
  version: string;
  /** Label periode yang disarankan, mis. "04 Oktober - 03 November 2026". */
  suggestedPeriod: string;
  periodStart?: string;
  periodEnd?: string;
  signers: SignerSelection;
}

export type DefaultsSource = 'server' | 'cache' | 'builtin';

export interface DefaultsLoadResult {
  defaults: LaporanDefaults;
  source: DefaultsSource;
  /** true = server menjawab (endpoint tersedia). */
  serverAvailable: boolean;
}

/** Nilai bawaan (dipakai bila server & cache belum ada). */
export function builtinDefaults(): LaporanDefaults {
  return {
    project: 'Pekerjaan Jasa Joint Development',
    coverTitle: 'Digitalisasi Aplikasi Human Capital Operations',
    title:
      'Laporan Pekerjaan Jasa Joint Developtment Digitalisasi Aplikasi Human Capital Operations',
    docNo: '',
    spphNo: '',
    version: '1.0',
    suggestedPeriod: '',
    signers: { dibuat: '', diperiksa: '', disetujui: '', disetujui2: '' },
  };
}

export function normalizeDefaults(raw: Partial<LaporanDefaults> | null | undefined): LaporanDefaults {
  const base = builtinDefaults();
  const periodStart = raw?.periodStart ?? '';
  const periodEnd = raw?.periodEnd ?? '';
  return {
    project: raw?.project?.trim() || base.project,
    coverTitle: raw?.coverTitle?.trim() || base.coverTitle,
    title: raw?.title?.trim() || base.title,
    docNo: raw?.docNo ?? '',
    spphNo: raw?.spphNo ?? '',
    version: raw?.version?.trim() || base.version,
    suggestedPeriod:
      raw?.suggestedPeriod?.trim() || buildPeriodLabel(periodStart, periodEnd) || '',
    periodStart,
    periodEnd,
    signers: {
      dibuat: raw?.signers?.dibuat ?? '',
      diperiksa: raw?.signers?.diperiksa ?? '',
      disetujui: raw?.signers?.disetujui ?? '',
      disetujui2: raw?.signers?.disetujui2 ?? '',
    },
  };
}

function readCache(): LaporanDefaults | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DEFAULTS_CACHE_KEY);
    if (!raw) return null;
    return normalizeDefaults(JSON.parse(raw) as Partial<LaporanDefaults>);
  } catch {
    return null;
  }
}

export function writeDefaultsCache(defaults: LaporanDefaults): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEFAULTS_CACHE_KEY, JSON.stringify(defaults));
  } catch {
    // kuota penuh / mode privat — abaikan, default tetap dipakai di sesi ini
  }
}

/** Muat default: server dulu, lalu cache browser, lalu nilai bawaan. */
export async function loadDefaults(): Promise<DefaultsLoadResult> {
  try {
    const response = await fetch('/api/laporan/defaults', { cache: 'no-store' });
    if (response.ok) {
      const json = await response.json().catch(() => null);
      if (json?.success && json.data) {
        const defaults = normalizeDefaults(json.data as Partial<LaporanDefaults>);
        writeDefaultsCache(defaults);
        return { defaults, source: 'server', serverAvailable: true };
      }
    }
  } catch {
    // jaringan/endpoint belum ada — jatuh ke cache
  }

  const cached = readCache();
  if (cached) return { defaults: cached, source: 'cache', serverAvailable: false };
  return { defaults: builtinDefaults(), source: 'builtin', serverAvailable: false };
}

/** Simpan default setelah generate sukses (server + cache). */
export async function saveDefaults(defaults: LaporanDefaults): Promise<boolean> {
  const payload = normalizeDefaults(defaults);
  writeDefaultsCache(payload);

  try {
    const response = await fetch('/api/laporan/defaults', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Saran periode berikutnya: geser rentang sebulan ke depan. */
export function suggestNextPeriod(startIso: string, endIso: string): { start: string; end: string } {
  const shift = (iso: string, months: number): string => {
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return iso;
    const [, year, month, day] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1 + months, Number(day)));
    return date.toISOString().slice(0, 10);
  };

  return {
    start: startIso ? shift(startIso, 1) : '',
    end: endIso ? shift(endIso, 1) : '',
  };
}

/** Default yang diringkas dari state wizard (dipakai saat generate sukses). */
export function defaultsFromMeta(
  meta: {
    project: string;
    coverTitle: string;
    title: string;
    docNo: string;
    spphNo: string;
    version: string;
    periodStart: string;
    periodEnd: string;
  },
  signers: SignerSelection
): LaporanDefaults {
  return normalizeDefaults({
    project: meta.project,
    coverTitle: meta.coverTitle,
    title: meta.title,
    docNo: meta.docNo,
    spphNo: meta.spphNo,
    version: meta.version,
    periodStart: meta.periodStart,
    periodEnd: meta.periodEnd,
    suggestedPeriod: buildPeriodLabel(meta.periodStart, meta.periodEnd),
    signers,
  });
}

/** Kunci periode `YYYY-MM` dari default (dipakai untuk saran periode). */
export function defaultPeriodKey(defaults: LaporanDefaults): string {
  return periodKeyFromEnd(defaults.periodEnd ?? '');
}
