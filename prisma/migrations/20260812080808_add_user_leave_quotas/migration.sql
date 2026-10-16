-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuotaHistoryType" ADD VALUE 'ANNUAL_RESET';
ALTER TYPE "QuotaHistoryType" ADD VALUE 'BORROWED_QUOTA_DEDUCTION';

-- AlterTable
ALTER TABLE "leave_quota_histories" ALTER COLUMN "description" DROP NOT NULL;

-- AlterTable
ALTER TABLE "leave_request_types" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "user_leave_quotas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "totalQuota" INTEGER NOT NULL DEFAULT 12,
    "usedQuota" INTEGER NOT NULL DEFAULT 0,
    "borrowedQuota" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_leave_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_leave_quotas_userId_leaveTypeId_year_key" ON "user_leave_quotas"("userId", "leaveTypeId", "year");

-- AddForeignKey
ALTER TABLE "user_leave_quotas" ADD CONSTRAINT "user_leave_quotas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_leave_quotas" ADD CONSTRAINT "user_leave_quotas_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
