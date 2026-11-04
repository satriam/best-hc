import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiError, normalizeError } from '@/lib/api-error';
import { parseLaporanDocx } from '@/lib/laporan/parse-docx';
import type { LaporanMetaGuess, ParsedModule } from '@/lib/laporan/types';

/** Batas total unggahan (semua file) — gambar ikut base64 di respons. */
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/laporan/parse — multipart 1..N file `.docx`.
 *
 * Respons: `{ success, data: { docs: ParseResult[], modules, metaGuess, stats } }`.
 * `modules` digabung dari semua file (urutan file dipertahankan) supaya frontend
 * bisa langsung memakainya; `docs` menyimpan hasil per file.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, message: 'Body harus multipart/form-data dengan field "files"' },
      { status: 400 }
    );
  }

  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return NextResponse.json(
      { success: false, message: 'Tidak ada file .docx yang diunggah (field "files")' },
      { status: 400 }
    );
  }

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { success: false, message: 'Total ukuran file melebihi 10 MB' },
      { status: 413 }
    );
  }

  try {
    const docs = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.docx')) {
        throw new ApiError(`${file.name}: hanya file .docx yang didukung`, 415);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      docs.push(parseLaporanDocx(file.name, buffer));
    }

    const modules: ParsedModule[] = [];
    const moduleIndex = new Map<string, ParsedModule>();
    const metaGuess: LaporanMetaGuess = {
      project: null,
      docNo: null,
      title: null,
      period: null,
      date: null,
      version: null,
    };

    for (const doc of docs) {
      for (const parsedModule of doc.modules) {
        const existing = moduleIndex.get(parsedModule.name);
        if (existing) {
          existing.items.push(...parsedModule.items);
        } else {
          const copy: ParsedModule = { name: parsedModule.name, items: [...parsedModule.items] };
          moduleIndex.set(parsedModule.name, copy);
          modules.push(copy);
        }
      }
      for (const [key, value] of Object.entries(doc.metaGuess)) {
        const field = key as keyof LaporanMetaGuess;
        if (value && !metaGuess[field]) metaGuess[field] = value;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        docs,
        modules,
        metaGuess,
        stats: {
          files: docs.length,
          modules: modules.length,
          items: modules.reduce((total, entry) => total + entry.items.length, 0),
        },
      },
    });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal membaca file .docx');
    const status = error instanceof ApiError ? error.status : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
