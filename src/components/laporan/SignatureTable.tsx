'use client';

import React from 'react';
import { formatDateIndo } from './laporan-ui';

/**
 * Pratinjau Lembar Persetujuan — meniru tabel asli pada
 * `templates/laporan-bulanan.docx` (tabel ke-3, 11 baris).
 *
 * Struktur hasil ekstraksi template (twips):
 *   gridCols [4371, 34, 4405] → dua kolom lebar sama dengan sekat tipis.
 *   r0 Dibuat Oleh: | Diperiksa Oleh: (span 2)
 *   r1 Tanggal …    | Tanggal …        (span 2)
 *   r2 jabatan/instansi | jabatan/instansi
 *   r3 area tanda tangan (h 1323 twip)
 *   r4 nama | nama
 *   r5 baris kosong (h 420, span 3)
 *   r6 Disetujui Oleh (span 3, h 276)
 *   r7 Tanggal … (span 3, h 331)
 *   r8 jabatan (span 2) | jabatan pembanding (span 1)
 *   r9 area tanda tangan (span 2 & 1, h 1286)
 *   r10 nama (span 2) | nama pembanding (span 1)
 *
 * Tinggi twip → px: 1323 ≈ 88px, 1286 ≈ 86px, 420 ≈ 28px, 331 ≈ 22px, 276 ≈ 18px.
 */

const BORDER = '1px solid #9ca3af';
const SIGNATURE_HEIGHT = 88;
const SIGNATURE_HEIGHT_2 = 86;

export interface SignaturePerson {
  nama?: string;
  jabatan?: string;
  instansi?: string;
}

export interface SignatureTableProps {
  dibuat?: SignaturePerson | null;
  diperiksa?: SignaturePerson | null;
  disetujui?: SignaturePerson | null;
  disetujui2?: SignaturePerson | null;
  /** Tanggal dokumen (ISO `YYYY-MM-DD` atau label Indonesia). */
  tanggal: string;
}

/** `Jabatan / Instansi` sesuai format dokumen. */
function positionLine(person?: SignaturePerson | null): string {
  if (!person) return '';
  const parts = [person.jabatan, person.instansi].map((value) => (value ?? '').trim()).filter(Boolean);
  return parts.join(' / ');
}

function tanggalText(tanggal: string): string {
  const iso = formatDateIndo(tanggal);
  return iso || tanggal || '';
}

/** Nama kosong ditandai garis putus-putus tipis (bukan teks "TBD"). */
const NameSlot: React.FC<{ name?: string }> = ({ name }) => {
  const text = (name ?? '').trim();
  if (text) {
    return <span className="font-semibold text-slate-900">{text}</span>;
  }
  return (
    <span
      className="inline-block h-[1px] w-24 align-middle"
      style={{ borderTop: '1px dashed #9ca3af' }}
      aria-label="belum dipilih"
    />
  );
};

/** Ubah baris master penanda tangan menjadi data preview. */
export function personFromSigner(
  signer?: { name?: string; position?: string | null; department?: string | null } | null
): SignaturePerson | null {
  if (!signer) return null;
  return {
    nama: signer.name ?? '',
    jabatan: signer.position ?? '',
    instansi: signer.department ?? '',
  };
}

export function SignatureTable({
  dibuat,
  diperiksa,
  disetujui,
  disetujui2,
  tanggal,
}: SignatureTableProps) {
  const tgl = tanggalText(tanggal);
  // Font 11px di layar sempit, 12px mulai sm — tanpa memecah layout.
  const cell = 'px-2 py-[3px] align-middle text-[11px] sm:text-xs leading-snug';
  const labelCell = `${cell} text-left text-slate-800`;
  const centerCell = `${cell} text-center`;

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full max-w-[720px] bg-white text-slate-900"
        style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'Inter, Arial, Helvetica, sans-serif' }}
        data-testid="signature-table"
        aria-label="Pratinjau Lembar Persetujuan"
      >
        <colgroup>
          <col style={{ width: '49.7%' }} />
          <col style={{ width: '0.6%' }} />
          <col style={{ width: '49.7%' }} />
        </colgroup>
        <tbody>
          {/* r0 — Judul blok */}
          <tr>
            <td className={labelCell} style={{ border: BORDER }}>
              Dibuat Oleh:
            </td>
            <td className={labelCell} style={{ border: BORDER }} colSpan={2}>
              Diperiksa Oleh:
            </td>
          </tr>

          {/* r1 — Tanggal */}
          <tr>
            <td className={labelCell} style={{ border: BORDER }}>
              Tanggal: {tgl}
            </td>
            <td className={labelCell} style={{ border: BORDER }} colSpan={2}>
              Tanggal: {tgl}
            </td>
          </tr>

          {/* r2 — Jabatan / Instansi */}
          <tr>
            <td className={labelCell} style={{ border: BORDER }}>
              {positionLine(dibuat)}
            </td>
            <td className={labelCell} style={{ border: BORDER }} colSpan={2}>
              {positionLine(diperiksa)}
            </td>
          </tr>

          {/* r3 — Area tanda tangan (h 1323 twip) */}
          <tr>
            <td style={{ border: BORDER, height: SIGNATURE_HEIGHT }} />
            <td style={{ border: BORDER, height: SIGNATURE_HEIGHT }} colSpan={2} />
          </tr>

          {/* r4 — Nama */}
          <tr>
            <td className={centerCell} style={{ border: BORDER }}>
              <NameSlot name={dibuat?.nama} />
            </td>
            <td className={centerCell} style={{ border: BORDER }} colSpan={2}>
              <NameSlot name={diperiksa?.nama} />
            </td>
          </tr>

          {/* r5 — Baris kosong pemisah (h 420) */}
          <tr>
            <td style={{ border: BORDER, height: 28 }} colSpan={3} />
          </tr>

          {/* r6 — Disetujui Oleh */}
          <tr>
            <td className={labelCell} style={{ border: BORDER, height: 18 }} colSpan={3}>
              Disetujui Oleh
            </td>
          </tr>

          {/* r7 — Tanggal */}
          <tr>
            <td className={labelCell} style={{ border: BORDER, height: 22 }} colSpan={3}>
              Tanggal: {tgl}
            </td>
          </tr>

          {/* r8 — Jabatan / Instansi (kolom kiri span 2, kanan span 1) */}
          <tr>
            <td className={labelCell} style={{ border: BORDER, height: 18 }} colSpan={2}>
              {positionLine(disetujui)}
            </td>
            <td className={labelCell} style={{ border: BORDER, height: 18 }}>
              {positionLine(disetujui2)}
            </td>
          </tr>

          {/* r9 — Area tanda tangan (h 1286 twip) */}
          <tr>
            <td style={{ border: BORDER, height: SIGNATURE_HEIGHT_2 }} colSpan={2} />
            <td style={{ border: BORDER, height: SIGNATURE_HEIGHT_2 }} />
          </tr>

          {/* r10 — Nama */}
          <tr>
            <td className={centerCell} style={{ border: BORDER, height: 18 }} colSpan={2}>
              <NameSlot name={disetujui?.nama} />
            </td>
            <td className={centerCell} style={{ border: BORDER, height: 18 }}>
              <NameSlot name={disetujui2?.nama} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
