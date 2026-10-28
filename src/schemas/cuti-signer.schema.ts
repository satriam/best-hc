import { z } from 'zod';
import { CutiSignerRole } from '@prisma/client';

/**
 * Master penanda tangan cetak permohonan cuti.
 * Role: `KNOWING` = Mengetahui, `APPROVER` = Menyetujui.
 */
export const cutiSignerSchema = z.object({
  role: z.nativeEnum(CutiSignerRole),
  name: z.string().trim().min(2, 'Nama penanda tangan minimal 2 karakter'),
  nip: z.string().trim().max(50, 'NIP maksimal 50 karakter').optional().nullable(),
  position: z.string().trim().max(200, 'Jabatan maksimal 200 karakter').optional().nullable(),
  department: z.string().trim().max(200, 'Departemen maksimal 200 karakter').optional().nullable(),
  workUnit: z.string().trim().max(50, 'Satuan kerja maksimal 50 karakter').optional().nullable(),
  /** Satu penanda tangan boleh terhubung ke banyak user (array kosong = tanpa user). */
  userIds: z
    .array(z.string().uuid('ID user tidak valid'))
    .max(50, 'Maksimal 50 user')
    .optional()
    .default([]),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export type CutiSignerInput = z.infer<typeof cutiSignerSchema>;

/**
 * Schema UPDATE penanda tangan cuti.
 *
 * Sama seperti SPKL: JANGAN memakai `cutiSignerSchema.partial()` karena
 * `.default()` tetap dijalankan saat key tidak dikirim sehingga body parsial
 * (mis. hanya `{ "position": "..." }`) ikut menimpa `isDefault`/`isActive`.
 */
export const updateCutiSignerSchema = z
  .object({
    role: z.nativeEnum(CutiSignerRole).optional(),
    name: z.string().trim().min(2, 'Nama penanda tangan minimal 2 karakter').optional(),
    nip: z.string().trim().max(50, 'NIP maksimal 50 karakter').optional().nullable(),
    position: z.string().trim().max(200, 'Jabatan maksimal 200 karakter').optional().nullable(),
    department: z.string().trim().max(200, 'Departemen maksimal 200 karakter').optional().nullable(),
    workUnit: z.string().trim().max(50, 'Satuan kerja maksimal 50 karakter').optional().nullable(),
    /** Tanpa `.default()`: `[]` = lepas semua tautan, key tidak dikirim = jangan sentuh relasi. */
    userIds: z.array(z.string().uuid('ID user tidak valid')).max(50, 'Maksimal 50 user').optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada data yang diubah',
  });

export type UpdateCutiSignerInput = z.infer<typeof updateCutiSignerSchema>;
