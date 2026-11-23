import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { ApiError, normalizeError } from '@/lib/api-error';
import { formatTanggalIndonesia } from '@/lib/laporan/format';
import {
  readSignatureLayout,
  type SignatureLayoutValues,
} from '@/lib/laporan/signature-layout';
import { getLaporanSignerById } from '@/services/laporan-signer.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PersonLine {
  nama: string;
  jabatan: string;
  instansi: string;
}

/**
 * Query boleh berisi id master penanda tangan **atau** nama bebas:
 * id → nama/jabatan/instansi diambil dari master, nama → dipakai apa adanya.
 */
async function resolvePerson(value: string | null): Promise<PersonLine> {
  const raw = (value ?? '').trim();
  if (!raw) return { nama: '', jabatan: '', instansi: '' };

  if (UUID_RE.test(raw)) {
    const row = await getLaporanSignerById(raw);
    if (row) {
      return {
        nama: row.name,
        jabatan: row.position ?? '',
        instansi: row.department ?? '',
      };
    }
  }
  return { nama: raw, jabatan: '', instansi: '' };
}

/**
 * GET /api/laporan/signature-layout?dibuat=&diperiksa=&disetujui=
 *
 * Struktur tabel persetujuan (lembar tanda tangan) dibaca langsung dari
 * `templates/laporan-bulanan.docx` → `{ columnCount, columns, rows, heightPx }`
 * dengan `rows[i] = { heightPx, cells:[{ text, colSpan, rowSpan, bold, align }] }`
 * (11 baris, sama dengan template).
 *
 * Parameter opsional mengisi nama penanda tangan secara otomatis (id master
 * atau nama), plus `tanggal` (`YYYY-MM-DD` → `5 November 2026`).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const [dibuat, diperiksa, disetujui, disetujui2] = await Promise.all([
      resolvePerson(searchParams.get('dibuat')),
      resolvePerson(searchParams.get('diperiksa')),
      resolvePerson(searchParams.get('disetujui')),
      resolvePerson(searchParams.get('disetujui2')),
    ]);

    const tanggal = formatTanggalIndonesia(searchParams.get('tanggal') ?? '');

    const values: SignatureLayoutValues = {
      dibuatNama: dibuat.nama,
      dibuatJabatan: dibuat.jabatan,
      dibuatInstansi: dibuat.instansi,
      diperiksaNama: diperiksa.nama,
      diperiksaJabatan: diperiksa.jabatan,
      diperiksaInstansi: diperiksa.instansi,
      disetujuiNama: disetujui.nama,
      disetujuiJabatan: disetujui.jabatan,
      disetujuiInstansi: disetujui.instansi,
      disetujui2Nama: disetujui2.nama,
      disetujui2Jabatan: disetujui2.jabatan,
      disetujui2Instansi: disetujui2.instansi,
      tanggal,
    };

    const layout = readSignatureLayout(values);

    return NextResponse.json({
      success: true,
      data: {
        ...layout,
        signers: { dibuat, diperiksa, disetujui, disetujui2 },
        tanggal,
      },
    });
  } catch (error: unknown) {
    const { message } = normalizeError(error, 'Gagal membaca layout tanda tangan');
    const status = error instanceof ApiError ? error.status : 400;
    return NextResponse.json({ success: false, message }, { status });
  }
}
