import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isApiError, normalizeError } from '@/lib/api-error';
import { deleteSignedDocument, parseEntityType } from '@/services/signed-document.service';

/**
 * DELETE /api/documents/[entityType]/[entityId]/[docId]
 *
 * Hapus permanen (ADMIN saja): file di Google Drive dihapus lebih dulu, baru
 * baris `signed_documents` dihapus (hard delete). Kalau Drive gagal, DB tidak
 * berubah dan API mengembalikan 502. Idempotent: Drive 404 dan DELETE berulang
 * untuk baris yang sudah hilang sama-sama dianggap sukses.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string; docId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, message: 'Hanya admin yang boleh menghapus dokumen' },
      { status: 403 }
    );
  }

  const { entityType: rawEntityType, entityId, docId } = await params;

  try {
    const entityType = parseEntityType(rawEntityType);
    const data = await deleteSignedDocument(entityType, entityId, docId, {
      id: session.id,
      role: session.role,
    });

    return NextResponse.json({
      success: true,
      message: data.alreadyDeleted
        ? 'Dokumen sudah tidak ada (sudah dihapus sebelumnya)'
        : 'Dokumen dan file Google Drive berhasil dihapus permanen',
      data,
    });
  } catch (error: unknown) {
    if (isApiError(error)) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      );
    }
    const { message } = normalizeError(error, 'Gagal menghapus dokumen');
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
