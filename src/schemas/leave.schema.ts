import { z } from 'zod';

/**
 * Satu rentang tanggal (segment) pada pengajuan cuti.
 * Satu pengajuan bisa terdiri dari beberapa segment, masing-masing punya jenis cuti sendiri.
 */
export const leaveSegmentSchema = z.object({
  leaveTypeId: z.string().uuid('ID Jenis cuti tidak valid'),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Tanggal mulai rentang wajib diisi dan valid',
  }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Tanggal selesai rentang wajib diisi dan valid',
  }),
});

export type LeaveSegmentInput = z.infer<typeof leaveSegmentSchema>;

/**
 * Normalisasi tanggal menjadi kunci kalender 'YYYY-MM-DD' (tanggal lokal).
 * Dipakai untuk membandingkan rentang tanggal tanpa terpengaruh jam/timezone.
 */
export function toDateKey(value: string | Date): string {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Format tanggal untuk pesan error: 01/10/2026 */
export function formatDateId(value: string | Date): string {
  const key = toDateKey(value);
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Cek tumpang tindih dua rentang tanggal secara inklusif (hari kalender).
 */
export function rangesOverlap(
  a: { startDate: string | Date; endDate: string | Date },
  b: { startDate: string | Date; endDate: string | Date }
): boolean {
  return toDateKey(a.startDate) <= toDateKey(b.endDate) && toDateKey(b.startDate) <= toDateKey(a.endDate);
}

/**
 * Skema PAYLOAD API pengajuan cuti (`POST /api/leave-requests`).
 * Mendukung dua bentuk:
 *   1. BENTUK BARU — `segments: [{ leaveTypeId, startDate, endDate }]`
 *   2. BENTUK LAMA — `leaveTypeIds[]` + `startDate` + `endDate` (dikonversi jadi 1 segment)
 */
export const createLeaveRequestPayloadSchema = z
  .object({
    /**
     * Bentuk BARU: daftar rentang tanggal, tiap rentang punya jenis cuti sendiri.
     * Contoh: [{Cuti Tahunan, 1-3 Okt}, {Istri Melahirkan, 4 Okt}, {Cuti Tahunan, 10-11 Okt}]
     */
    segments: z.array(leaveSegmentSchema).optional(),
    /**
     * Bentuk LAMA (tetap didukung): satu jenis cuti (bisa lebih) + satu rentang.
     * Diberi nilai default kosong agar tipe hasil inferensi tetap `string`/`string[]`
     * (form lama di UI tidak perlu diubah); kewajiban isinya divalidasi di superRefine
     * hanya ketika `segments` tidak dikirim.
     */
    leaveTypeIds: z.array(z.string().uuid('ID Jenis cuti tidak valid')).default([]),
    startDate: z.string().default(''),
    endDate: z.string().default(''),
    reason: z.string().min(3, 'Keterangan minimal 3 karakter'),
    attachmentUrl: z.string().optional().nullable(),
    userId: z.string().uuid('ID karyawan tidak valid').optional(),
  })
  .superRefine((data, ctx) => {
    const segments = data.segments ?? [];

    // Bentuk lama: validasi satu rentang seperti sebelumnya.
    if (segments.length === 0) {
      if (data.leaveTypeIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['leaveTypeIds'],
          message: 'Pilih minimal satu jenis cuti',
        });
      }
      if (!data.startDate || isNaN(Date.parse(data.startDate))) {
        ctx.addIssue({
          code: 'custom',
          path: ['startDate'],
          message: 'Tanggal mulai wajib diisi dan valid',
        });
      }
      if (!data.endDate || isNaN(Date.parse(data.endDate))) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'Tanggal selesai wajib diisi dan valid',
        });
      }
      if (
        data.startDate &&
        data.endDate &&
        !isNaN(Date.parse(data.startDate)) &&
        !isNaN(Date.parse(data.endDate)) &&
        new Date(data.endDate) < new Date(data.startDate)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'Tanggal selesai harus setelah atau sama dengan tanggal mulai',
        });
      }
      return;
    }

    // Bentuk baru: tiap segment endDate >= startDate
    segments.forEach((segment, index) => {
      if (new Date(segment.endDate) < new Date(segment.startDate)) {
        ctx.addIssue({
          code: 'custom',
          path: ['segments', index, 'endDate'],
          message: `Rentang ke-${index + 1}: tanggal selesai harus setelah atau sama dengan tanggal mulai`,
        });
      }
    });

    // Bentuk baru: antar segment tidak boleh tumpang tindih (per tanggal, hari kalender)
    for (let i = 0; i < segments.length; i += 1) {
      for (let j = i + 1; j < segments.length; j += 1) {
        if (rangesOverlap(segments[i], segments[j])) {
          ctx.addIssue({
            code: 'custom',
            path: ['segments', j, 'startDate'],
            message: `Rentang ke-${j + 1} (${formatDateId(segments[j].startDate)} - ${formatDateId(
              segments[j].endDate
            )}) tumpang tindih dengan rentang ke-${i + 1} (${formatDateId(
              segments[i].startDate
            )} - ${formatDateId(segments[i].endDate)})`,
          });
        }
      }
    }
  });

export const updateLeaveStatusSchema = z.object({
  status: z.enum(['ON_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED', 'DONE']),
  adminNote: z.string().optional().nullable(),
});

/**
 * Skema FORM lama (satu jenis cuti + satu rentang) — dipakai halaman create/edit
 * yang sudah ada. Bentuk & tipenya dipertahankan agar tidak breaking.
 * Untuk mengirim multi-rentang, kirim payload bentuk baru ke API
 * (lihat `createLeaveRequestPayloadSchema`).
 */
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
  .refine((data) => new Date(data.endDate) >= new Date(data.startDate), {
    message: 'Tanggal selesai harus setelah atau sama dengan tanggal mulai',
    path: ['endDate'],
  });

/** Tipe nilai form lama (create/edit) — bentuknya tidak berubah. */
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
/** Tipe payload API — mendukung `segments[]` maupun bentuk lama. */
export type CreateLeaveRequestPayload = z.infer<typeof createLeaveRequestPayloadSchema>;
export type UpdateLeaveStatusInput = z.infer<typeof updateLeaveStatusSchema>;
