'use client';

import React from 'react';
import { formatHours, formatDateID, SPKL_TYPE_OPTIONS } from './spkl-ui';
import type { SpklDetail } from './types';

/** Escape teks pengguna sebelum dimasukkan ke HTML cetak. */
function esc(value: string | null | undefined): string {
  return (value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string)
  );
}

const CHECKED = '&#9746;'; // ☒
const UNCHECKED = '&#9744;'; // ☐

const c =
  'border-right:1px solid #000!important;border-bottom:1px solid #000!important;border-top:0!important;border-left:0!important;box-sizing:border-box!important;';
const hdr = `${c}padding:2px 3px;text-align:center;background-color:#002060;color:#fff;font-weight:bold;font-size:8px;line-height:1.15;-webkit-print-color-adjust:exact;print-color-adjust:exact;`;
const cell = `${c}padding:2px 3px;font-size:8px;line-height:1.2;vertical-align:top;`;
const cellCenter = `${cell}text-align:center;vertical-align:middle;`;

/**
 * HTML form resmi SPKL — mengikuti formulir PDF "Formulir SPKL Karyawan".
 *
 * Sengaja dibangun sebagai string HTML (pola yang sama dengan cetak form cuti)
 * agar CSS cetak tidak bertabrakan dengan Tailwind.
 */
export function buildSpklPrintHtml(spkl: SpklDetail): string {
  const pic = spkl.pic;
  const approver = spkl.approver;
  const items = spkl.items ?? [];

  const typeChecks = SPKL_TYPE_OPTIONS.map(
    (option) => `${spkl.type === option.value ? CHECKED : UNCHECKED} ${esc(option.label)}`
  )
    .map((label) => `<span style="display:inline-block;min-width:32%;white-space:nowrap;">${label}</span>`)
    .join('');

  const itemRows = items
    .map((item, index) => {
      const isLong = (item.taskDescription ?? '').length > 120;
      return `<tr style="page-break-inside:avoid;break-inside:avoid;">
        <td style="${cellCenter}">${index + 1}</td>
        <td style="${cellCenter}">${esc(item.workerNik)}</td>
        <td style="${cell}">${esc(item.workerName)}</td>
        <td style="${cell}">${esc(item.workerPosition) || '&nbsp;'}</td>
        <td style="${cell}${isLong ? 'font-size:7.5px;' : ''}white-space:pre-wrap;word-break:break-word;">${esc(item.taskDescription)}</td>
        <td style="${cellCenter}white-space:nowrap;">${esc(formatDateID(item.workDate))}</td>
        <td style="${cell}">${esc(item.company) || '&nbsp;'}</td>
        <td style="${cellCenter}">${esc(item.startTime)}</td>
        <td style="${cellCenter}">${esc(item.endTime)}</td>
        <td style="${cellCenter}white-space:nowrap;">${formatHours(item.hours)} Jam</td>
        <td style="${cell}">&nbsp;</td>
      </tr>`;
    })
    .join('');

  const noBorder = 'border:none!important;padding:1px 2px;font-size:9px;line-height:1.35;vertical-align:top;';
  const label = `${noBorder}width:62px;`;
  const colon = `${noBorder}width:8px;text-align:center;`;
  const value = `${noBorder}font-weight:bold;`;

  return `
<style>
  .spkl-print table.grid-table { border-collapse: separate !important; border-spacing: 0 !important; border-top: 1px solid #000 !important; border-left: 1px solid #000 !important; }
  .spkl-print table.grid-table td, .spkl-print table.grid-table th { border-right: 1px solid #000 !important; border-bottom: 1px solid #000 !important; border-top: 0 !important; border-left: 0 !important; box-sizing: border-box !important; }
  .spkl-print thead { display: table-header-group !important; }
  .spkl-print tr { page-break-inside: avoid !important; break-inside: avoid !important; }
  .spkl-print .keep { page-break-inside: avoid !important; break-inside: avoid !important; }
</style>
<div class="spkl-print" style="background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;padding:0 2px;font-size:9px;line-height:1.3">
  <h1 style="text-align:center;font-weight:bold;font-size:12.5px;text-transform:uppercase;text-decoration:underline;margin:0 0 1px;letter-spacing:0.3px">SURAT PERINTAH KERJA LEMBUR (SPKL)</h1>
  <p style="text-align:center;font-size:7.5px;margin:0 0 6px;color:#333">Nomor: ${esc(spkl.number)}</p>

  <div class="keep" style="margin-bottom:5px">
    <p style="font-weight:bold;font-size:9px;margin:0 0 2px">Yang bertanda tangan dibawah ini:</p>
    <table style="border:none!important;border-collapse:collapse;width:100%;table-layout:fixed">
      <tr>
        <td style="${label}">Nama</td><td style="${colon}">:</td><td style="${value}">${esc(pic.name)}</td>
        <td style="${label}width:76px;">No. Pegawai</td><td style="${colon}">:</td><td style="${value}">${esc(pic.nip) || '-'}</td>
      </tr>
      <tr>
        <td style="${label}">Jabatan</td><td style="${colon}">:</td><td style="${value}">${esc(pic.position) || '-'}</td>
        <td style="${label}width:76px;">Satuan Kerja</td><td style="${colon}">:</td><td style="${value}">${esc(spkl.workUnit || pic.workUnit) || '-'}</td>
      </tr>
    </table>
  </div>

  <p style="font-size:9px;margin:0 0 4px">Dengan ini menugaskan kepada Pekerja Alih Daya dibawah ini untuk melaksanakan kerja lembur dengan rincian:</p>

  <div class="keep" style="border:1px solid #000;padding:3px 6px;margin-bottom:5px;font-size:8.5px">
    <span style="font-weight:bold;margin-right:8px">Jenis Lembur :</span>${typeChecks}
  </div>

  <table class="grid-table" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate!important;border-spacing:0!important;border-top:1px solid #000!important;border-left:1px solid #000!important;table-layout:fixed">
    <colgroup>
      <col style="width:3%" /><col style="width:9%" /><col style="width:12%" /><col style="width:10%" />
      <col style="width:21%" /><col style="width:9%" /><col style="width:13%" /><col style="width:5%" />
      <col style="width:5%" /><col style="width:6%" /><col style="width:7%" />
    </colgroup>
    <thead>
      <tr>
        <th rowspan="2" style="${hdr}">No</th>
        <th rowspan="2" style="${hdr}">NIK</th>
        <th rowspan="2" style="${hdr}">Nama</th>
        <th rowspan="2" style="${hdr}">Jabatan/Posisi</th>
        <th rowspan="2" style="${hdr}">Uraian Tugas</th>
        <th rowspan="2" style="${hdr}">Tanggal Lembur</th>
        <th rowspan="2" style="${hdr}">Nama Perusahaan Alih Daya</th>
        <th colspan="2" style="${hdr}">Waktu</th>
        <th rowspan="2" style="${hdr}">Jumlah Jam</th>
        <th rowspan="2" style="${hdr}">Paraf Pelaksana Tugas Lembur</th>
      </tr>
      <tr>
        <th style="${hdr}">Mulai</th>
        <th style="${hdr}">Selesai</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td colspan="11" style="${cellCenter}">Belum ada baris pekerja</td></tr>`}
      <tr>
        <td colspan="9" style="${c}padding:2px 4px;font-size:8.5px;font-weight:bold;text-align:right;background-color:#e8edf7;-webkit-print-color-adjust:exact;print-color-adjust:exact;">TOTAL JAM KERJA LEMBUR</td>
        <td style="${cellCenter}font-weight:bold;background-color:#e8edf7;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${formatHours(spkl.totalHours)} Jam</td>
        <td style="${cell}">&nbsp;</td>
      </tr>
    </tbody>
  </table>

  <p style="font-size:9px;margin:5px 0 0">Demikian untuk dilaksanakan dengan penuh rasa tanggung jawab.</p>

  <table class="keep" style="border:none!important;border-collapse:collapse;width:100%;margin-top:8px">
    <tr>
      <td style="border:none!important;width:50%;text-align:center;font-size:8.5px;vertical-align:top">
        <div style="font-weight:bold">Yang Menyetujui</div>
        <div style="font-weight:bold;text-transform:uppercase;font-size:8px;min-height:10px">${esc(approver.department) || '&nbsp;'}</div>
        <div style="height:38px"></div>
        <div style="font-weight:bold;text-decoration:underline">${esc(approver.name)}</div>
        <div style="font-size:8px">NIP. ${esc(approver.nip) || '-'}</div>
      </td>
      <td style="border:none!important;width:50%;text-align:center;font-size:8.5px;vertical-align:top">
        <div style="font-weight:bold">Yang Menugaskan</div>
        <div style="font-weight:bold;text-transform:uppercase;font-size:8px;min-height:10px">${esc(pic.position) || '&nbsp;'}</div>
        <div style="height:38px"></div>
        <div style="font-weight:bold;text-decoration:underline">${esc(pic.name)}</div>
        <div style="font-size:8px">NIP. ${esc(pic.nip) || '-'}</div>
      </td>
    </tr>
  </table>

  <div class="keep" style="margin-top:7px;font-size:7.5px;line-height:1.35">
    <div style="font-weight:bold;font-size:8px">Catatan:</div>
    <div>- Setiap Pelaksanaan Lembur Kerja, Karyawan yang ditugaskan untuk melaksanakan pekerjaan WAJIB melakukan Absensi Kehadiran secara real-time melalui Aplikasi CISEA.</div>
    <div>- Wajib Melampirkan Hasil Kerja pada Setiap Pengajuan SPKL (Dalam Bentuk Laporan Kerja melalui Chat, email, atau media lain yang dapat mewakili pelaksanaan Lembur Kerja ini).</div>
  </div>

  <div class="keep" style="margin-top:5px;font-size:7.5px;line-height:1.35">
    <div style="font-weight:bold;font-size:8px">HAL YANG PERLU DIPERHATIKAN</div>
    <div>1. NIK karyawan perlu dipastikan ke karyawan yang ditugaskan dalam pelaksanaan Lembur Kerja ini.</div>
    <div>2. Pastikan saat mengisi kolom Mulai Lembur, Selesai Lembur, dan Istirahat sesuai dengan jam kerja yang disetujui atau berdasarkan data CISEA persetujuan lembur harian (bukan tebakan).</div>
    <div>3. Pastikan setiap SPKL punya bukti dokumen persetujuan atasan sebelum diinput.</div>
  </div>
</div>`;
}

/** CSS cetak global (sembunyikan layar, tampilkan hanya template). */
export function SpklPrintStyles() {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          .official-print-template,
          .official-print-template * {
            visibility: visible !important;
          }
          .official-print-template {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            font-family: Arial, Helvetica, sans-serif !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }
        }
      `,
      }}
    />
  );
}

/** Template cetak SPKL — hanya tampil saat `window.print()`. */
export function SpklPrintTemplate({ spkl }: { spkl: SpklDetail }) {
  return (
    <div
      className="official-print-template hidden print:block"
      dangerouslySetInnerHTML={{ __html: buildSpklPrintHtml(spkl) }}
    />
  );
}
