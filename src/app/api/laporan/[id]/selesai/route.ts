import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiError, normalizeError } from '@/lib/api-error';
import { laporanSelesaiSchema } from '@/schemas/laporan.schema';
import { finalizeLaporan } from '@/services/laporan.service';

/**
 * POST /api/laporan/:id/selesai — generate ulang dari payload tersimpan lalu
 * unggah ke folder Drive "Laporan Bulanan" (`GDRIVE_LAPORAN_FOLDER_ID`).
 *
 * Body opsional:
 * - `{}` (atau tanpa body): file arsip lama untuk (periode + proyek + versi)
 *   yang sama dihapus, lalu diganti dokumen terbaru.
 * - `{ "bumpVersion": true }`: versi dinaikkan (`1.0` → `1.1`), file lama
 *   dipertahankan sebagai riwayat dengan nama `…_v<versi-lama>.docx`, dan
 *   dokumen versi baru diunggah terpisah.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const options = laporanSelesaiSchema.parse(body);

    const {
      record,
      upload,
      fileName,
      docxPath,
      previousRemoved,
      previousRenamed,
      previousVersion,
    } = await finalizeLaporan(id, { bumpVersion: options.bumpVersion });

    return NextResponse.json({
      success: true,
      message: options.bumpVersion
        ? `Laporan versi ${record.version} diarsipkan ke Google Drive (versi ${previousVersion} disimpan sebagai riwayat)`
        : 'Laporan diarsipkan ke Google Drive',
      data: {
        laporan: record,
        file: {
          id: upload.id,
          name: fileName,
          link: upload.webViewLink,
          sizeBytes: upload.sizeBytes,
        },
        docxPath,
        version: record.version,
        previousVersion: previousVersion ?? null,
        previousFileRemoved: previousRemoved,
        previousFileRenamed: previousRenamed,
      },
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal mengarsipkan laporan ke Google Drive');
    const status = error instanceof ApiError ? error.status : issues ? 422 : 400;
    return NextResponse.json({ success: false, message, issues }, { status });
  }
}
