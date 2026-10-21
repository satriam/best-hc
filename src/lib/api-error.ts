/**
 * Normalisasi error (Zod / Prisma / Error biasa) menjadi pesan yang aman
 * ditampilkan ke klien. Dipakai route handler API supaya tidak memakai `any`.
 */
export interface NormalizedError {
  message: string;
  issues?: { path?: (string | number)[]; message?: string }[];
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
