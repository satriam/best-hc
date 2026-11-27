import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiError, normalizeError } from '@/lib/api-error';
import { laporanDefaultsSchema } from '@/schemas/laporan.schema';
import { getLaporanDefaults, saveLaporanDefaults } from '@/services/laporan-default.service';

/**
 * GET /api/laporan/defaults — prefill wizard laporan bulanan.
 *
 * Selalu `200` walaupun tabel `laporan_defaults` masih kosong: nilai fallback
 * diambil dari konstanta + master penanda tangan default. Respons juga memuat
 * `suggestedPeriod: { start, end, label }` (tanggal 4 bulan berjalan s.d.
 * tanggal 3 bulan berikutnya, zona Asia/Jakarta).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await getLaporanDefaults();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal membaca default laporan');
    const status = error instanceof ApiError ? error.status : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}

/**
 * PUT /api/laporan/defaults — simpan nilai yang dipakai terakhir kali generate.
 *
 * Menerima kontrak resmi (`projectName`, `coverTitle`, `docTitle`, `docNo`,
 * `spphNo`, `version`, `dibuatSignerId`, …) maupun bentuk UI (`project`,
 * `title`, `signers:{ dibuat, diperiksa, disetujui, disetujui2 }`).
 */
export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const parsed = laporanDefaultsSchema.parse(body);

    const data = await saveLaporanDefaults(parsed, session.id);

    return NextResponse.json({
      success: true,
      message: 'Default laporan disimpan',
      data,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal menyimpan default laporan');
    const status = error instanceof ApiError ? error.status : issues ? 422 : 400;
    return NextResponse.json({ success: false, message, issues }, { status });
  }
}
