/**
 * Utilitas gambar untuk lampiran laporan: baca dimensi & data URL.
 *
 * Kenapa ditulis manual (tanpa `sharp`/`image-size`): satu-satunya yang dibutuhkan
 * adalah lebar/tinggi dari header PNG/JPEG, cukup ~60 baris dan tidak menambah
 * native dependency ke build Vercel.
 */

export interface ImageInfo {
  width: number;
  height: number;
  mimeType: string;
  /** Ekstensi tanpa titik (`png`, `jpeg`). */
  ext: string;
}

/** Lebar maksimum gambar lampiran di halaman A4 (margin 2,5 cm) dalam piksel (96 dpi). */
export const MAX_IMAGE_WIDTH_PX = 580;

function pngInfo(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 24) return null;
  const signature = buffer.subarray(0, 8);
  const isPng =
    signature[0] === 0x89 &&
    signature[1] === 0x50 &&
    signature[2] === 0x4e &&
    signature[3] === 0x47;
  if (!isPng) return null;
  // IHDR selalu chunk pertama: 8 byte signature + 4 panjang + 4 tipe.
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height, mimeType: 'image/png', ext: 'png' };
}

function jpegInfo(buffer: Buffer): ImageInfo | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0..SOF15 (kecuali DHT/JPG/DAC) menyimpan dimensi.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (!width || !height) return null;
      return { width, height, mimeType: 'image/jpeg', ext: 'jpeg' };
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

export function readImageInfo(buffer: Buffer): ImageInfo | null {
  return pngInfo(buffer) ?? jpegInfo(buffer);
}

/**
 * Ukuran gambar yang dipakai modul gambar docxtemplater: **piksel**, lalu
 * dikonversi modul ke EMU. Lebar dibatasi `MAX_IMAGE_WIDTH_PX` dan aspek rasio
 * dipertahankan; gambar kecil TIDAK diperbesar supaya tidak pecah.
 */
export function fitImageSize(info: ImageInfo | null): [number, number] {
  if (!info) return [MAX_IMAGE_WIDTH_PX, Math.round((MAX_IMAGE_WIDTH_PX * 3) / 4)];
  if (info.width <= MAX_IMAGE_WIDTH_PX) return [info.width, info.height];
  return [MAX_IMAGE_WIDTH_PX, Math.max(1, Math.round((info.height * MAX_IMAGE_WIDTH_PX) / info.width))];
}

export interface DecodedDataUrl {
  buffer: Buffer;
  mimeType: string;
}

/** `data:image/png;base64,AAA...` → buffer + mime. `null` bila bukan data URL valid. */
export function decodeDataUrl(value: string): DecodedDataUrl | null {
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  return { buffer: Buffer.from(match[2].replace(/\s/g, ''), 'base64'), mimeType };
}

/** Tebak mime dari isi file (dipakai saat parser membaca media docx). */
export function mimeFromBuffer(buffer: Buffer): string {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.length > 4 && buffer.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (buffer.length > 2 && buffer.toString('ascii', 0, 2) === 'BM') return 'image/bmp';
  return 'image/png';
}
