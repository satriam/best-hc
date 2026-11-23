import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiError, normalizeError } from '@/lib/api-error';
import { DOCX_MIME, regenerateLaporan } from '@/services/laporan.service';

/**
 * POST /api/laporan/:id/generate — bangun ulang `.docx` dari data tersimpan.
 *
 * Tidak menerima body: seluruh isi form sudah tersimpan di `PUT /api/laporan/:id`
 * (atau hasil `POST /api/laporan/generate`). Berkas terakhir juga ditulis ke
 * `uploads/laporan/<id>.docx`.
 *
 * Bila status laporan sudah `selesai`, dokumen baru belum ada di Drive sehingga
 * baris ditandai `needsDriveSync=true` sampai `POST /api/laporan/:id/selesai`
 * dipanggil lagi.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { record, buffer, fileName, docxPath } = await regenerateLaporan(id);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': DOCX_MIME,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(buffer.length),
        'X-Laporan-Id': record.id,
        'X-Laporan-File-Name': fileName,
        'X-Laporan-Status': record.status,
        'X-Laporan-Needs-Drive-Sync': record.needsDriveSync ? 'true' : 'false',
        'X-Laporan-Docx-Path': docxPath,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal membuat ulang dokumen laporan');
    const status = error instanceof ApiError ? error.status : issues ? 422 : 400;
    return NextResponse.json({ success: false, message, issues }, { status });
  }
}
