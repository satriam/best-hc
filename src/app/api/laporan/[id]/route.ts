import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiError, normalizeError } from '@/lib/api-error';
import { normalizeLaporanPayload } from '@/lib/laporan/payload';
import { deleteLaporan, getLaporanDetail, saveLaporanDraft } from '@/services/laporan.service';

/**
 * GET /api/laporan/:id — detail siap-edit.
 *
 * Respons `data` berisi baris DB (period, projectName, docNo, title, version,
 * status, driveLink, needsDriveSync, …) + `meta` (payload tersimpan, bentuk
 * internal) + `payload` (kontrak resmi datar: projectName, coverTitle,
 * docTitle, items[].category, signers.*Id).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const data = await getLaporanDetail(id);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal membaca laporan');
    const status = error instanceof ApiError ? error.status : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}

/**
 * PUT /api/laporan/:id — simpan draft dari payload form (tanpa membuat .docx).
 *
 * Body sama dengan `POST /api/laporan/generate` (payload resmi atau payload
 * lama). Kolom ringkas (`title`, `docNo`, `version`, `itemCount`) ikut
 * diperbarui supaya daftar laporan langsung konsisten.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const text = await request.text();
    const body = text && text.trim().length > 0 ? JSON.parse(text) : {};
    const payload = normalizeLaporanPayload(body);

    const record = await saveLaporanDraft(id, payload);

    return NextResponse.json({
      success: true,
      message: 'Draft laporan tersimpan',
      data: record,
    });
  } catch (error: unknown) {
    const { message, issues } = normalizeError(error, 'Gagal menyimpan draft laporan');
    const status = error instanceof ApiError ? error.status : issues ? 422 : 400;
    return NextResponse.json({ success: false, message, issues }, { status });
  }
}

/**
 * DELETE /api/laporan/:id — hapus laporan (baris DB + berkas .docx lokal).
 * Arsip Google Drive dibiarkan; `data.driveLink` berisi tautannya bila ada.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const data = await deleteLaporan(id);
    return NextResponse.json({ success: true, message: 'Laporan dihapus', data });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal menghapus laporan');
    const status = error instanceof ApiError ? error.status : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
