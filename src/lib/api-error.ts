import { ZodError } from 'zod';

/**
 * Normalisasi error (Zod / Prisma / Error biasa) menjadi pesan yang aman
 * ditampilkan ke klien. Dipakai route handler API supaya tidak memakai `any`.
 */
export interface NormalizedError {
  message: string;
  issues?: { path?: (string | number)[]; message?: string }[];
}

/**
 * Error domain yang membawa HTTP status sendiri, supaya route handler bisa
 * membedakan 400 (input salah bentuk) dari 422 (input valid tapi ditolak aturan bisnis).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Deteksi `ZodError` (zod v3/v4). Dipakai supaya kegagalan validasi bentuk body
 * dibalas 422, bukan 400 — 400/401/403/404/500 tetap milik `ApiError`.
 *
 * Selain `instanceof`, dicek juga `name === 'ZodError'` + `issues` array supaya
 * tetap terdeteksi kalau ada dua salinan modul `zod` di bundel.
 */
export function isZodError(error: unknown): error is ZodError {
  if (error instanceof ZodError) return true;
  return (
    error instanceof Error &&
    error.name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

/** Ringkas issue Zod → `{ path, message }` yang aman diserialisasi ke JSON. */
function summarizeIssues(rawIssues: readonly unknown[]) {
  return rawIssues.map((issue) => {
    const item = (issue ?? {}) as { path?: unknown; message?: unknown };
    const path = Array.isArray(item.path)
      ? (item.path.filter(
          (segment) => typeof segment === 'string' || typeof segment === 'number'
        ) as (string | number)[])
      : undefined;

    return {
      path,
      message: typeof item.message === 'string' ? item.message : undefined,
    };
  });
}

/**
 * Normalisasi `ZodError` menjadi pesan validasi pertama + daftar issue ringkas.
 * Pesan pertama dipakai supaya teks yang tampil di UI tetap spesifik (frontend
 * membaca `message`), sementara `issues` menyimpan detail per field.
 */
export function normalizeZodError(error: ZodError, fallback: string): NormalizedError {
  const issues = summarizeIssues(error.issues ?? []);

  const message = issues
    .map((issue) => issue.message)
    .find((value): value is string => Boolean(value));

  return { message: message ?? fallback, issues };
}

export function normalizeError(error: unknown, fallback: string): NormalizedError {
  if (error && typeof error === 'object') {
    const candidate = error as {
      issues?: unknown;
      errors?: unknown;
      message?: unknown;
    };

    // zod v4: daftar issue ada di `issues`; zod v3 memakai `errors`.
    const rawIssues = Array.isArray(candidate.issues)
      ? candidate.issues
      : Array.isArray(candidate.errors)
        ? candidate.errors
        : null;

    if (rawIssues && rawIssues.length > 0) {
      const issues = rawIssues.map((issue) => {
        const item = (issue ?? {}) as { path?: unknown; message?: unknown };
        return {
          path: Array.isArray(item.path) ? (item.path as (string | number)[]) : undefined,
          message: typeof item.message === 'string' ? item.message : undefined,
        };
      });

      const message = issues
        .map((issue) => issue.message)
        .filter((value): value is string => Boolean(value))
        .join('; ');

      return { message: message || fallback, issues };
    }

    if (typeof candidate.message === 'string' && candidate.message.trim().length > 0) {
      return { message: candidate.message };
    }
  }

  return { message: fallback };
}
