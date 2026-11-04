import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiError, normalizeError } from '@/lib/api-error';
import { finalizeLaporan } from '@/services/laporan.service';

/**
 * POST /api/laporan/:id/selesai — generate ulang dari payload tersimpan lalu
 * unggah ke folder Drive "Laporan Bulanan" (`GDRIVE_LAPORAN_FOLDER_ID`).
 *
 * File arsip lama untuk (period + proyek + versi) yang sama dihapus lebih dulu.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const { record, upload, fileName, previousRemoved } = await finalizeLaporan(id);

    return NextResponse.json({
      success: true,
      message: 'Laporan diarsipkan ke Google Drive',
      data: {
        laporan: record,
        file: { id: upload.id, name: fileName, link: upload.webViewLink, sizeBytes: upload.sizeBytes },
        previousFileRemoved: previousRemoved,
      },
    });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal mengarsipkan laporan ke Google Drive');
    const status = error instanceof ApiError ? error.status : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
