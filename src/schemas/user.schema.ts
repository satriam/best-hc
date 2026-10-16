import { z } from 'zod';

export const createUserSchema = z.object({
  nip: z.string().optional().nullable(),
  workUnit: z.string().optional().nullable(),
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(6, 'Password minimal 6 karakter'),
  role: z.enum(['USER', 'ADMIN']).default('USER'),
  gender: z.enum(['MALE', 'FEMALE']).default('MALE'),
  totalQuota: z.number().int().min(0, 'Kuota tidak boleh negatif').default(12),
});

export const updateUserSchema = z.object({
  nip: z.string().optional().nullable(),
  workUnit: z.string().optional().nullable(),
  name: z.string().min(2, 'Nama minimal 2 karakter').optional(),
  email: z.string().email('Email tidak valid').optional(),
  password: z.string().min(6, 'Password minimal 6 karakter').optional().or(z.literal('')),
  role: z.enum(['USER', 'ADMIN']).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  totalQuota: z.number().int().min(0, 'Kuota tidak boleh negatif').optional(),
});

export const updateQuotaSchema = z.object({
  totalQuota: z.number().int().min(0, 'Kuota tidak boleh negatif'),
  leaveTypeId: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateQuotaInput = z.infer<typeof updateQuotaSchema>;
