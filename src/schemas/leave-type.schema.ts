import { z } from 'zod';
import { LeaveCategory, CalculationType } from '@prisma/client';

export const leaveTypeSchema = z.object({
  name: z.string().min(2, 'Nama jenis cuti minimal 2 karakter'),
  category: z.nativeEnum(LeaveCategory).default(LeaveCategory.CUTI),
  defaultDays: z.number().int().min(1).optional().nullable(),
  daysDescription: z.string().optional().nullable(),
  calculationType: z.nativeEnum(CalculationType).default(CalculationType.WORKING_DAYS),
});

export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;
