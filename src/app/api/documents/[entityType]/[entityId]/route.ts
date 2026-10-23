import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { isApiError, normalizeError } from '@/lib/api-error';
import {
  MAX_PDF_BYTES,
  listSignedDocuments,
  parseEntityType,
  uploadSignedDocument,
} from '@/services/signed-document.service';

/**
 * /api/documents/[entityType]/[entityId]
 *
 * entityType : SPKL | LEAVE_REQUEST
 * GET  — daftar dokumen (semua user yang login, read-only)
 * POST — upload PDF bertanda tangan (ADMIN saja), multipart field `file`
 */

/** Cek objek mirip `File` dari FormData tanpa bergantung pada class global. */
function isUploadedFile(value: unknown): value is File {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { arrayBuffer?: unknown; name?: unknown; size?: unknown };
  return (
    typeof candidate.arrayBuffer === 'function' &&
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number'
  );
}

function errorResponse(error: unknown, fallback: string) {
  if (isApiError(error)) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status }
    );
  }
  const { message } = normalizeError(error, fallback);
  return NextResponse.json({ success: false, message }, { status: 500 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { entityType: rawEntityType, entityId } = await params;

  try {
    const entityType = parseEntityType(rawEntityType);
    const data = await listSignedDocuments(entityType, entityId);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return errorResponse(error, 'Gagal mengambil daftar dokumen');
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'ADMIN') {
    return NextResponse.json(
      { success: false, message: 'Hanya admin yang boleh mengunggah dokumen' },
      { status: 403 }
    );
  }

  const { entityType: rawEntityType, entityId } = await params;

  try {
    const entityType = parseEntityType(rawEntityType);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Body harus multipart/form-data dengan field "file"' },
        { status: 400 }
      );
    }

    const file = formData.get('file');
    if (!isUploadedFile(file)) {
      return NextResponse.json(
        { success: false, message: 'File tidak ditemukan pada field "file"' },
        { status: 400 }
      );
    }

    // Batas ukuran dicek dari metadata dulu supaya file besar tidak dibaca penuh.
    if (file.size === 0) {
      return NextResponse.json({ success: false, message: 'File kosong' }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        { success: false, message: 'Ukuran file melebihi 10 MB' },
        { status: 413 }
      );
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ success: false, message: 'File bukan PDF' }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    const { document, warnings } = await uploadSignedDocument({
      entityType,
      entityId,
      actor: { id: session.id, role: session.role },
      bytes,
      mimeType: file.type,
    });

    return NextResponse.json(
      { success: true, message: 'Dokumen berhasil diunggah', data: document, warnings },
      { status: 200 }
    );
  } catch (error: unknown) {
    return errorResponse(error, 'Gagal mengunggah dokumen');
  }
}
