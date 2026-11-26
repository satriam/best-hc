-- Perbaikan data: baris kuota "Cuti Tahunan" yang terbuat dengan 999 (tanpa batas)
-- karena jenis cuti ini tidak punya defaultDays. Jatah disamakan dengan kuota
-- tahunan user di tabel leave_quotas (fallback 12). Baris lain tidak disentuh.
UPDATE "user_leave_quotas" AS q
SET "totalQuota" = COALESCE(lq."totalQuota", 12),
    "updatedAt" = NOW()
FROM "leave_types" AS t, "users" AS u
LEFT JOIN "leave_quotas" AS lq ON lq."userId" = u."id"
WHERE t."id" = q."leaveTypeId"
  AND u."id" = q."userId"
  AND t."name" = 'Cuti Tahunan'
  AND t."defaultDays" IS NULL
  AND q."totalQuota" >= 999;
