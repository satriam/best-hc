import { z } from 'zod';

export const createLeaveRequestSchema = z
  .object({
    leaveTypeIds: z
      .array(z.string().uuid('ID Jenis cuti tidak valid'))
      .min(1, 'Pilih minimal satu jenis cuti'),
    startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Tanggal mulai wajib diisi dan valid',
    }),
    endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Tanggal selesai wajib diisi dan valid',
    }),
    reason: z.string().min(3, 'Keterangan minimal 3 karakter'),
    attachmentUrl: z.string().optional().nullable(),
    userId: z.string().uuid('ID karyawan tidak valid').optional(),
  })
  .refine(
    (data) => new Date(data.endDate) >= new Date(data.startDate),
    {
      message: 'Tanggal selesai harus setelah atau sama dengan tanggal mulai',
      path: ['endDate'],
    }
  );

export const updateLeaveStatusSchema = z.object({
  status: z.enum(['ON_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED', 'DONE']),
  adminNote: z.string().optional().nullable(),
});

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type UpdateLeaveStatusInput = z.infer<typeof updateLeaveStatusSchema>;
