import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { importCutiSignersFromSpkl } from '@/services/cuti-signer.service';
import { importCutiSignerFromSpklSchema } from '@/schemas/cuti-signer.schema';
import { normalizeError } from '@/lib/api-error';

/**
 * POST /api/cuti-signers/import-spkl — ADMIN only.
 * Salin data master penanda tangan SPKL ke master penanda tangan cuti.
 *
 * Body: `{ items: [{ spklSignerId, role: 'KNOWING' | 'APPROVER', isDefault? }] }`
 * Respons berisi `copied[]` dan `skipped[]` (duplikat / sumber tidak ditemukan).
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden: Admin only' }, { status: 403 });
  }

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = importCutiSignerFromSpklSchema.parse(body);

    const result = await importCutiSignersFromSpkl(validated);

    const parts: string[] = [];
    if (result.copied.length > 0) parts.push(`${result.copied.length} penanda tangan disalin`);
    if (result.skipped.length > 0) parts.push(`${result.skipped.length} dilewati`);

    return NextResponse.json({
      success: true,
      message: parts.length > 0 ? `Selesai: ${parts.join(', ')}.` : 'Tidak ada data yang disalin.',
      data: result,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal menyalin penanda tangan dari SPKL');
    return NextResponse.json({ success: false, message, issues }, { status: 400 });
  }
}
