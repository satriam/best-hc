import { z } from 'zod';
import { SpklSignerRole, SpklStatus, SpklType } from '@prisma/client';
import { isValidTime } from '@/lib/spkl';

const timeSchema = (label: string) =>
  z
    .string()
    .trim()
    .refine((value) => isValidTime(value), { message: `Jam ${label} wajib diisi dengan format HH:mm` });

const dateSchema = (label: string) =>
  z.string().trim().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: `${label} wajib diisi dan valid`,
  });

/** Satu baris rincian pekerja pada SPKL. `hours` diabaikan (selalu dihitung server). */
export const spklItemSchema = z.object({
  workerNik: z.string().trim().min(1, 'NIK pekerja wajib diisi'),
  workerName: z.string().trim().min(1, 'Nama pekerja wajib diisi'),
  workerPosition: z.string().trim().optional().nullable(),
  company: z.string().trim().optional().nullable(),
  taskDescription: z.string().trim().min(1, 'Uraian tugas wajib diisi'),
  workDate: dateSchema('Tanggal lembur'),
  startTime: timeSchema('mulai'),
  endTime: timeSchema('selesai'),
  /** Diabaikan — jam selalu dihitung server dari startTime–endTime. */
  hours: z.union([z.number(), z.string()]).optional(),
});

export type SpklItemInput = z.infer<typeof spklItemSchema>;

export const createSpklSchema = z.object({
  picId: z.string().uuid('PIC (Yang Menugaskan) tidak valid'),
  approverId: z.string().uuid('Penyetuju (Yang Menyetujui) tidak valid'),
  type: z.nativeEnum(SpklType).default(SpklType.WORKDAY),
  workUnit: z.string().trim().max(50, 'Satuan kerja maksimal 50 karakter').optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  /** true → status awal ON_PROGRESS, selain itu DRAFT. */
  submit: z.boolean().optional().default(false),
  items: z.array(spklItemSchema).min(1, 'Minimal 1 baris pekerja'),
  /** ADMIN boleh membuat atas nama user lain. */
  userId: z.string().uuid('ID karyawan tidak valid').optional(),
});

export type CreateSpklInput = z.infer<typeof createSpklSchema>;

export const updateSpklSchema = z
  .object({
    picId: z.string().uuid('PIC (Yang Menugaskan) tidak valid').optional(),
    approverId: z.string().uuid('Penyetuju (Yang Menyetujui) tidak valid').optional(),
    type: z.nativeEnum(SpklType).optional(),
    workUnit: z.string().trim().max(50, 'Satuan kerja maksimal 50 karakter').optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    submit: z.boolean().optional(),
    items: z.array(spklItemSchema).min(1, 'Minimal 1 baris pekerja').optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada data yang diubah',
  });

export type UpdateSpklInput = z.infer<typeof updateSpklSchema>;

export const updateSpklStatusSchema = z.object({
  status: z.nativeEnum(SpklStatus).refine((value) => value !== SpklStatus.DRAFT, {
    message: 'Status DRAFT tidak dapat diset melalui endpoint ini',
  }),
  rejectedNote: z.string().trim().optional().nullable(),
});

export type UpdateSpklStatusInput = z.infer<typeof updateSpklStatusSchema>;

export const spklSignerSchema = z.object({
  role: z.nativeEnum(SpklSignerRole),
  name: z.string().trim().min(2, 'Nama penanda tangan minimal 2 karakter'),
  nip: z.string().trim().max(50, 'NIP maksimal 50 karakter').optional().nullable(),
  position: z.string().trim().max(200, 'Jabatan maksimal 200 karakter').optional().nullable(),
  department: z.string().trim().max(200, 'Departemen maksimal 200 karakter').optional().nullable(),
  workUnit: z.string().trim().max(50, 'Satuan kerja maksimal 50 karakter').optional().nullable(),
  /** Satu penanda tangan boleh terhubung ke banyak user (array kosong = tanpa user). */
  userIds: z.array(z.string().uuid('ID user tidak valid')).max(50, 'Maksimal 50 user').optional().default([]),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  sortOrder: z.number().int().min(0).optional().default(0),
});

export type SpklSignerInput = z.infer<typeof spklSignerSchema>;

/**
 * Schema UPDATE penanda tangan.
 *
 * PENTING: jangan memakai `spklSignerSchema.partial()`. `.partial()` hanya membuat
 * field jadi optional, tetapi `.default()` pada field tetap dijalankan saat key tidak
 * dikirim — akibatnya body `{ "position": "..." }` ikut menghasilkan
 * `isDefault: false, isActive: true, sortOrder: 0` dan service menimpanya sebagai
 * perubahan eksplisit (flag default hilang / penanda tangan nonaktif aktif kembali).
 * Karena itu field di sini ditulis ulang TANPA `.default()`.
 */
export const updateSpklSignerSchema = z
  .object({
    role: z.nativeEnum(SpklSignerRole).optional(),
    name: z.string().trim().min(2, 'Nama penanda tangan minimal 2 karakter').optional(),
    nip: z.string().trim().max(50, 'NIP maksimal 50 karakter').optional().nullable(),
    position: z.string().trim().max(200, 'Jabatan maksimal 200 karakter').optional().nullable(),
    department: z.string().trim().max(200, 'Departemen maksimal 200 karakter').optional().nullable(),
    workUnit: z.string().trim().max(50, 'Satuan kerja maksimal 50 karakter').optional().nullable(),
    /**
     * Tanpa `.default()`: `[]` berarti "lepas semua tautan", sedangkan key yang
     * tidak dikirim berarti "jangan sentuh relasi user sama sekali".
     */
    userIds: z.array(z.string().uuid('ID user tidak valid')).max(50, 'Maksimal 50 user').optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Tidak ada data yang diubah',
  });

export type UpdateSpklSignerInput = z.infer<typeof updateSpklSignerSchema>;
