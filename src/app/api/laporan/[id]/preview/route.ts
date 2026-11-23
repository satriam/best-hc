import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiError, normalizeError } from '@/lib/api-error';
import { DOCX_MIME, renderLaporanPreview } from '@/services/laporan.service';

/**
 * GET /api/laporan/:id/preview — .docx hasil render untuk pratinjau di browser.
 * Tidak menyimpan apa pun (tanpa efek samping ke DB/disk).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { buffer, fileName } = await renderLaporanPreview(id);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': DOCX_MIME,
        'Content-Disposition': `inline; filename="${fileName}"`,
        'Content-Length': String(buffer.length),
        'X-Laporan-File-Name': fileName,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal membuat pratinjau laporan');
    const status = error instanceof ApiError ? error.status : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
