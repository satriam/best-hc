import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiError, normalizeError } from '@/lib/api-error';
import { laporanGenerateSchema } from '@/schemas/laporan.schema';
import { DOCX_MIME, generateLaporan } from '@/services/laporan.service';
import { buildLaporanFileName } from '@/lib/laporan/format';
import { featureForbidden } from '@/services/feature.service';

/**
 * POST /api/laporan/generate — body JSON `{ meta, items, signers, ... }`.
 *
 * Respons: file `.docx` (attachment) + header `X-Laporan-Id` berisi id draft
 * yang baru dibuat/diperbarui, sehingga frontend bisa memanggil
 * `POST /api/laporan/:id/selesai` untuk mengarsipkannya ke Drive.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const denied = await featureForbidden(session, 'LAPORAN');
  if (denied) return denied;

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const validated = laporanGenerateSchema.parse(body);

    const { record, buffer } = await generateLaporan(validated, session.id);
    const fileName = buildLaporanFileName(record.projectName, record.period, record.version);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': DOCX_MIME,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(buffer.length),
        'X-Laporan-Id': record.id,
        'X-Laporan-File-Name': fileName,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal membuat laporan');
    const status = error instanceof ApiError ? error.status : issues ? 422 : 400;
    return NextResponse.json({ success: false, message, issues }, { status });
  }
}
