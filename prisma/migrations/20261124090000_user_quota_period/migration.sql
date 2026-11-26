-- AlterTable
ALTER TABLE "users" ADD COLUMN "joinDate" TIMESTAMP(3),
ADD COLUMN "quotaResetMonth" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "quotaResetDay" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "lastQuotaResetYear" INTEGER;

-- Batas nilai tanggal reset (tanggal 1–28 supaya ada di setiap bulan).
ALTER TABLE "users" ADD CONSTRAINT "users_quotaResetMonth_check" CHECK ("quotaResetMonth" BETWEEN 1 AND 12);
ALTER TABLE "users" ADD CONSTRAINT "users_quotaResetDay_check" CHECK ("quotaResetDay" BETWEEN 1 AND 28);

-- User lama: semua reset 1 Januari dan periode tahun berjalan dianggap sudah di-reset,
-- supaya cron harian tidak me-reset ulang di tengah tahun.
UPDATE "users" SET "lastQuotaResetYear" = EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Jakarta'))::INTEGER;
