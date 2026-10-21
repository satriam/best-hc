-- AlterTable
ALTER TABLE "leave_quota_histories" ADD COLUMN     "leaveTypeId" TEXT;

-- CreateIndex
CREATE INDEX "leave_quota_histories_leaveRequestId_idx" ON "leave_quota_histories"("leaveRequestId");

-- CreateIndex
CREATE INDEX "leave_quota_histories_userId_leaveTypeId_idx" ON "leave_quota_histories"("userId", "leaveTypeId");

-- AddForeignKey
ALTER TABLE "leave_quota_histories" ADD CONSTRAINT "leave_quota_histories_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill best-effort: petakan jenis cuti dari teks `description` ke `leave_types.name`.
-- Hanya untuk baris yang terkait pengajuan (leaveRequestId NOT NULL) karena baris itulah
-- yang dipakai menghitung rincian kuota per pengajuan. Baris tanpa pengajuan (alokasi awal,
-- penyesuaian admin) dibiarkan NULL. Nama terpanjang menang supaya "Cuti Bersalin dengan
-- Keadaan Khusus" tidak salah dipetakan ke "Cuti Bersalin". Kalau tidak ada yang cocok → NULL.
UPDATE "leave_quota_histories" AS h
SET "leaveTypeId" = m."leaveTypeId"
FROM (
  SELECT h2."id" AS history_id,
         (
           SELECT lt."id"
           FROM "leave_types" lt
           WHERE h2."description" IS NOT NULL
             AND h2."description" ILIKE '%' || lt."name" || '%'
           ORDER BY length(lt."name") DESC
           LIMIT 1
         ) AS "leaveTypeId"
  FROM "leave_quota_histories" h2
  WHERE h2."leaveRequestId" IS NOT NULL
) AS m
WHERE h."id" = m.history_id
  AND m."leaveTypeId" IS NOT NULL;
