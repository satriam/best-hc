import { z } from 'zod';
import { LaporanSignerRole } from '@prisma/client';

/** Data URL gambar lampiran (hanya PNG/JPEG — dua format yang didukung Word). */
const dataUrlSchema = z
  .string()
  .max(8 * 1024 * 1024, 'Satu gambar maksimal 8 MB')
  .regex(/^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/i, 'Gambar harus data URL PNG/JPEG');

export const laporanSignerDataSchema = z.object({
  /** Bila diisi, data lain diambil dari master penanda tangan. */
  id: z.string().uuid('ID penanda tangan tidak valid').optional(),
  nama: z.string().trim().max(200, 'Nama maksimal 200 karakter').optional(),
  jabatan: z.string().trim().max(200, 'Jabatan maksimal 200 karakter').optional(),
  instansi: z.string().trim().max(200, 'Instansi maksimal 200 karakter').optional(),
  nip: z.string().trim().max(50, 'NIP maksimal 50 karakter').optional(),
});

export const laporanMetaSchema = z.object({
  project: z.string().trim().min(3, 'Nama proyek minimal 3 karakter').max(300),
  title: z.string().trim().min(3, 'Judul dokumen minimal 3 karakter').max(300),
  /** Kunci periode `YYYY-MM` — dipakai untuk unique (periode + proyek + versi). */
  period: z
    .string()
    .trim()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Periode harus berformat YYYY-MM (contoh 2026-09)'),
  /** Label tampilan di dokumen, mis. "04 September - 03 Oktober 2026". */
  periodLabel: z.string().trim().max(120).optional(),
  docNo: z.string().trim().max(120).optional(),
  version: z.string().trim().max(20).optional(),
  /** ISO `YYYY-MM-DD` atau label Indonesia; default hari ini. */
  date: z.string().trim().max(40).optional(),
});

export const laporanItemSchema = z.object({
  modul: z.string().trim().min(1, 'Modul wajib diisi').max(150),
  fitur: z.string().trim().min(1, 'Nama fitur/pekerjaan wajib diisi').max(300),
  status: z.string().trim().max(50).optional(),
  percent: z
    .union([z.number().min(0).max(100), z.string().trim().max(10)])
    .optional(),
  note: z.string().trim().max(500).optional(),
  section: z.enum(['development', 'maintenance']).optional(),
  gambar: dataUrlSchema.optional(),
  caption: z.string().trim().max(300).optional(),
});

export const laporanGenerateSchema = z.object({
  meta: laporanMetaSchema,
  items: z
    .array(laporanItemSchema)
    .min(1, 'Isi minimal 1 item pekerjaan')
    .max(300, 'Maksimal 300 item per laporan'),
  signers: z
    .object({
      dibuat: laporanSignerDataSchema.optional(),
      diperiksa: laporanSignerDataSchema.optional(),
      disetujui: laporanSignerDataSchema.optional(),
      /** Slot kedua blok "Disetujui Oleh" (mis. Application Development Dept Head). */
      disetujui2: laporanSignerDataSchema.optional(),
    })
    .optional(),
  revisions: z
    .array(
      z.object({
        versi: z.string().trim().min(1).max(20),
        nama: z.string().trim().max(200).optional(),
        tanggal: z.string().trim().max(40).optional(),
        keterangan: z.string().trim().max(300).optional(),
      })
    )
    .max(20)
    .optional(),
  intro: z.array(z.string().trim().max(2000)).max(20).optional(),
  scope: z.array(z.string().trim().max(300)).max(50).optional(),
});

export type LaporanGenerateInput = z.infer<typeof laporanGenerateSchema>;

/** CRUD master penanda tangan laporan. */
export const laporanSignerSchema = z.object({
  role: z.nativeEnum(LaporanSignerRole),
  name: z.string().trim().min(2, 'Nama penanda tangan minimal 2 karakter').max(200),
  nip: z.string().trim().max(50).optional().nullable(),
  position: z.string().trim().max(200).optional().nullable(),
  department: z.string().trim().max(200).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export type LaporanSignerInput = z.infer<typeof laporanSignerSchema>;

/**
 * Update parsial — tanpa `.default()` supaya body yang hanya berisi satu field
 * tidak ikut menimpa `isDefault`/`isActive`.
 */
export const updateLaporanSignerSchema = z
  .object({
    role: z.nativeEnum(LaporanSignerRole).optional(),
    name: z.string().trim().min(2, 'Nama penanda tangan minimal 2 karakter').max(200).optional(),
    nip: z.string().trim().max(50).optional().nullable(),
    position: z.string().trim().max(200).optional().nullable(),
    department: z.string().trim().max(200).optional().nullable(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada data yang diubah',
  });

export type UpdateLaporanSignerInput = z.infer<typeof updateLaporanSignerSchema>;

/** Filter daftar laporan. */
export const laporanListQuerySchema = z.object({
  period: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  status: z.enum(['draft', 'selesai']).optional(),
});
