import { z } from 'zod';

export const createUserSchema = z.object({
  nip: z.string().optional().nullable(),
  position: z.string().trim().max(200, 'Jabatan maksimal 200 karakter').optional().nullable(),
  workUnit: z.string().optional().nullable(),
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
  gender: z.enum(['MALE', 'FEMALE']).default('MALE'),
  totalQuota: z.number().int().min(0, 'Kuota tidak boleh negatif').default(12),
  /** Tanggal masuk kerja, format YYYY-MM-DD. Kosong = tidak diisi. */
  joinDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal masuk tidak valid')
    .optional()
    .nullable()
    .or(z.literal('')),
  /** Tanggal reset kuota cuti tahunan (bulan 1–12, tanggal 1–28). */
  quotaResetMonth: z.number().int().min(1, 'Bulan reset 1–12').max(12, 'Bulan reset 1–12').optional(),
  quotaResetDay: z.number().int().min(1, 'Tanggal reset 1–28').max(28, 'Tanggal reset 1–28').optional(),
  /** NON_SHIFT (default) atau SHIFT. SHIFT wajib punya pola roster + tanggal mulai. */
  workType: z.enum(['NON_SHIFT', 'SHIFT']).optional(),
  /** Pola roster: K = kerja, L = libur, 2–28 hari, mis. "KKKKLL". */
  rosterPattern: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[KL]{2,28}$/, 'Pola roster hanya huruf K/L, 2–28 hari')
    .refine((v) => v.includes('K'), 'Pola roster minimal punya satu hari kerja')
    .optional()
    .nullable()
    .or(z.literal('')),
  rosterStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal mulai roster tidak valid')
    .optional()
    .nullable()
    .or(z.literal('')),
});

export const updateUserSchema = z.object({
  nip: z.string().optional().nullable(),
  position: z.string().trim().max(200, 'Jabatan maksimal 200 karakter').optional().nullable(),
  workUnit: z.string().optional().nullable(),
  name: z.string().min(2, 'Nama minimal 2 karakter').optional(),
  email: z.string().email('Email tidak valid').optional(),
  password: z.string().min(6, 'Password minimal 6 karakter').optional().or(z.literal('')),
  role: z.enum(['USER', 'ADMIN']).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  totalQuota: z.number().int().min(0, 'Kuota tidak boleh negatif').optional(),
  /** Tanggal masuk kerja, format YYYY-MM-DD. Kosong = tidak diisi. */
  joinDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal masuk tidak valid')
    .optional()
    .nullable()
    .or(z.literal('')),
  /** Tanggal reset kuota cuti tahunan (bulan 1–12, tanggal 1–28). */
  quotaResetMonth: z.number().int().min(1, 'Bulan reset 1–12').max(12, 'Bulan reset 1–12').optional(),
  quotaResetDay: z.number().int().min(1, 'Tanggal reset 1–28').max(28, 'Tanggal reset 1–28').optional(),
  /** NON_SHIFT (default) atau SHIFT. SHIFT wajib punya pola roster + tanggal mulai. */
  workType: z.enum(['NON_SHIFT', 'SHIFT']).optional(),
  /** Pola roster: K = kerja, L = libur, 2–28 hari, mis. "KKKKLL". */
  rosterPattern: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[KL]{2,28}$/, 'Pola roster hanya huruf K/L, 2–28 hari')
    .refine((v) => v.includes('K'), 'Pola roster minimal punya satu hari kerja')
    .optional()
    .nullable()
    .or(z.literal('')),
  rosterStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal mulai roster tidak valid')
    .optional()
    .nullable()
    .or(z.literal('')),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
