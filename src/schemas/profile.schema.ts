import { z } from 'zod';

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Password saat ini wajib diisi'),
    newPassword: z.string().min(8, 'Password baru minimal 8 karakter').max(100),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Password baru harus berbeda dari password saat ini',
    path: ['newPassword'],
  });

export const changeEmailSchema = z.object({
  /** Kosong = kirim ulang verifikasi untuk email saat ini. */
  newEmail: z.string().trim().toLowerCase().email('Email tidak valid').optional(),
  password: z.string().min(1, 'Password wajib diisi'),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(20, 'Token tidak valid'),
});
