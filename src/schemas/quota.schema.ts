import { z } from 'zod';

/**
 * Mode input kuota cuti:
 * - TOTAL     : admin mengisi JATAH (totalQuota) — perilaku lama
 * - USED      : admin mengisi TERPAKAI (usedQuota)
 * - REMAINING : admin mengisi SISA (totalQuota - usedQuota)
 */
export const quotaAdjustModes = ['TOTAL', 'USED', 'REMAINING'] as const;
export const quotaSyncModes = ['USED', 'REMAINING'] as const;

export type QuotaAdjustMode = (typeof quotaAdjustModes)[number];
export type QuotaSyncMode = (typeof quotaSyncModes)[number];

const nonNegativeInt = z
  .number({ message: 'Nilai kuota wajib berupa angka' })
  .int('Nilai kuota harus bilangan bulat')
  .min(0, 'Nilai kuota tidak boleh negatif');

/**
 * Body `PUT /api/quotas/[userId]`.
 * Backward compat: body lama `{ totalQuota, leaveTypeId, year }` tetap diterima
 * dan diperlakukan sebagai `mode: 'TOTAL'`.
 */
export const updateQuotaSchema = z
  .object({
    mode: z.enum(quotaAdjustModes, {
      message: 'Mode harus salah satu dari TOTAL, USED, REMAINING',
    }).optional(),
    value: nonNegativeInt.optional(),
    totalQuota: nonNegativeInt.optional(),
    leaveTypeId: z.string().min(1, 'ID jenis cuti tidak valid').optional(),
    year: z.number().int('Tahun harus bilangan bulat').optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === undefined) {
      if (data.totalQuota === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['totalQuota'],
          message: 'Kirim `mode` + `value`, atau `totalQuota` (body lama)',
        });
      }
      return;
    }

    if (data.value === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: `Nilai \`value\` wajib diisi untuk mode ${data.mode}`,
      });
    }
  });

export type UpdateQuotaInput = z.infer<typeof updateQuotaSchema>;

const syncRowSchema = z
  .object({
    userId: z.string().min(1, 'userId tidak valid').optional(),
    userEmail: z.string().min(3, 'userEmail tidak valid').optional(),
    leaveTypeId: z.string().min(1, 'leaveTypeId tidak valid').optional(),
    leaveTypeName: z.string().min(1, 'leaveTypeName tidak valid').optional(),
    value: nonNegativeInt,
  })
  .superRefine((row, ctx) => {
    if (!row.userId && !row.userEmail) {
      ctx.addIssue({
        code: 'custom',
        path: ['userId'],
        message: 'Baris wajib punya `userId` atau `userEmail`',
      });
    }
    if (!row.leaveTypeId && !row.leaveTypeName) {
      ctx.addIssue({
        code: 'custom',
        path: ['leaveTypeId'],
        message: 'Baris wajib punya `leaveTypeId` atau `leaveTypeName`',
      });
    }
  });

/** Body `POST /api/quotas/sync` — maksimal 500 baris, all-or-nothing. */
export const quotaSyncSchema = z.object({
  year: z.number().int('Tahun harus bilangan bulat').optional(),
  mode: z.enum(quotaSyncModes, {
    message: 'Mode sync harus USED atau REMAINING',
  }),
  rows: z
    .array(syncRowSchema)
    .min(1, 'Minimal 1 baris untuk disinkronkan')
    .max(500, 'Maksimal 500 baris per permintaan'),
});

export type QuotaSyncInput = z.infer<typeof quotaSyncSchema>;
export type QuotaSyncRow = z.infer<typeof syncRowSchema>;
