-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "LeaveCategory" AS ENUM ('CUTI', 'IZIN_MENINGGALKAN');

-- CreateEnum
CREATE TYPE "CalculationType" AS ENUM ('WORKING_DAYS', 'CALENDAR_DAYS');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('ON_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuotaHistoryType" AS ENUM ('INITIAL_QUOTA', 'LEAVE_APPROVED', 'LEAVE_CANCELLED', 'LEAVE_REJECTED_AFTER_APPROVAL', 'LEAVE_DAYS_UPDATED', 'ADMIN_MANUAL_ADJUSTMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_quotas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalQuota" INTEGER NOT NULL DEFAULT 12,
    "usedQuota" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "LeaveCategory" NOT NULL DEFAULT 'CUTI',
    "defaultDays" INTEGER,
    "daysDescription" TEXT,
    "calculationType" "CalculationType" NOT NULL DEFAULT 'WORKING_DAYS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'ON_PROGRESS',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_request_types" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,

    CONSTRAINT "leave_request_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_quota_histories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveRequestId" TEXT,
    "previousQuota" INTEGER NOT NULL,
    "changeAmount" INTEGER NOT NULL,
    "newQuota" INTEGER NOT NULL,
    "type" "QuotaHistoryType" NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_quota_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "leave_quotas_userId_key" ON "leave_quotas"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_request_types_leaveRequestId_leaveTypeId_key" ON "leave_request_types"("leaveRequestId", "leaveTypeId");

-- AddForeignKey
ALTER TABLE "leave_quotas" ADD CONSTRAINT "leave_quotas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request_types" ADD CONSTRAINT "leave_request_types_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request_types" ADD CONSTRAINT "leave_request_types_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_quota_histories" ADD CONSTRAINT "leave_quota_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_quota_histories" ADD CONSTRAINT "leave_quota_histories_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
