// Uji render template laporan (tanpa server) — dipakai saat verifikasi fitur.
// Jalankan: node scripts/laporan/test-render.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ImageModule = require('docxtemplater-image-module-free');

const ROOT = resolve(import.meta.dirname, '../..');
const TEMPLATE = resolve(ROOT, 'templates/laporan-bulanan.docx');
const SOURCE = resolve(ROOT, '../laporan-generator/reference/contoh-laporan-bulanan.docx');
const OUT_DIR = resolve(ROOT, 'out');

// Gambar uji diambil dari file contoh (media yang sudah tidak dipakai template).
const sourceZip = new PizZip(readFileSync(SOURCE));
const pngA = sourceZip.file('word/media/image3.png').asNodeBuffer();
const pngB = sourceZip.file('word/media/image4.png').asNodeBuffer();
const pngC = sourceZip.file('word/media/image9.png').asNodeBuffer();

function imageSize(buffer) {
  // PNG
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
  }
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return [buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5)];
      }
      offset += 2 + length;
    }
  }
  return null;
}

const MAX_PX = 580;

function fit(size) {
  if (!size) return [MAX_PX, Math.round((MAX_PX * 2) / 3)];
  const [w, h] = size;
  if (w <= MAX_PX) return [w, h];
  return [MAX_PX, Math.round((h * MAX_PX) / w)];
}

const data = {
  project: 'Pengadaan Pekerjaan Joint Development Digitalisasi Aplikasi Human Capital Operations',
  docNo: '2496/Eks-BEST/BA/PBOE-272/XI/2026',
  title: 'Laporan Pekerjaan Jasa Joint Development Digitalisasi Aplikasi Human Capital Operations',
  period: '04 Oktober - 03 November 2026',
  version: '1.0',
  tanggal: '5 November 2026',
  dibuatNama: 'Satria Mulya Adiwardana',
  dibuatJabatan: 'Programmer Web',
  dibuatInstansi: 'PT Bukit Energi Servis Terpadu',
  diperiksaNama: 'Zulfikar Murakabiman',
  diperiksaJabatan: 'Programming Staff',
  diperiksaInstansi: 'PT Bukit Asam (Persero) Tbk',
  disetujuiNama: 'Zulkurniadi',
  disetujuiJabatan: 'Direktur',
  disetujuiInstansi: 'PT Bukit Energi Servis Terpadu',
  disetujui2Nama: 'Dedek Apriyani',
  disetujui2Jabatan: 'Application Development & Services/EIS Department Head',
  disetujui2Instansi: 'PT Bukit Asam (Persero) Tbk',
  revisions: [
    { versi: '1.0', nama: 'Satria Mulya Adiwardana', tanggal: '5 November 2026', keterangan: 'Dokumen Awal' },
  ],
  intro: [
    { text: 'Teknologi informasi memiliki peranan penting dalam mendukung proses bisnis PT Bukit Asam (Persero) Tbk.' },
    { text: 'Laporan ini merangkum pelaksanaan pekerjaan pengembangan aplikasi pada periode pelaporan.' },
  ],
  scope: [{ text: 'Analisa' }, { text: 'Design Interface' }, { text: 'Development' }, { text: 'Testing' }],
  items: [
    { modul: 'Travel', status: 'Done', fitur: 'Form pengajuan SPPD Driver', percent: '100%' },
    { modul: 'Travel', status: 'Done', fitur: 'Detail SPPD Driver', percent: '100%' },
    { modul: 'Leave', status: 'On Progress', fitur: 'Perbaikan batas pengajuan 30 hari', percent: '75%' },
  ],
  maintenanceItems: [{ modul: 'Absensi', fitur: 'Perbaikan lokasi absen', percent: '100%' }],
  appendix: [
    {
      modul: 'Travel',
      images: [
        { gambar: pngA.toString('base64'), caption: 'form pengajuan SPPD Driver' },
        { gambar: pngB.toString('base64'), caption: 'detail SPPD Driver' },
      ],
    },
    { modul: 'Leave', images: [{ gambar: pngC.toString('base64'), caption: 'notifikasi cuti' }] },
  ],
};

const zip = new PizZip(readFileSync(TEMPLATE));
const imageModule = new ImageModule({
  centered: false,
  getImage: (value) => Buffer.from(value, 'base64'),
  getSize: (buffer) => fit(imageSize(buffer)),
});

const doc = new Docxtemplater(zip, {
  modules: [imageModule],
  paragraphLoop: true,
  linebreaks: false,
  nullGetter: () => '',
});

doc.render(data);
const buffer = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

mkdirSync(OUT_DIR, { recursive: true });
const outFile = resolve(OUT_DIR, 'uji-laporan-bulanan.docx');
writeFileSync(outFile, buffer);

console.log('output :', outFile);
console.log('ukuran :', (buffer.length / 1024).toFixed(1), 'KB');
const text = doc.getZip().file('word/document.xml').asText();
console.log('sisa {  :', (text.match(/\{[^}]{0,40}\}/g) || []).slice(0, 10));
console.log('drawing :', (text.match(/<w:drawing>/g) || []).length);
console.log('fldSimple TOC:', (text.match(/<w:fldSimple[^>]*w:instr=" TOC/g) || []).length);
console.log('w:tbl   :', (text.match(/<w:tbl>/g) || []).length);
