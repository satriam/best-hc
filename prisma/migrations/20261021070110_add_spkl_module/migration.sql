-- CreateEnum
CREATE TYPE "SpklSignerRole" AS ENUM ('PIC', 'APPROVER');

-- CreateEnum
CREATE TYPE "SpklType" AS ENUM ('WORKDAY', 'OUTSIDE_WORKDAY', 'PUBLIC_HOLIDAY');

-- CreateEnum
CREATE TYPE "SpklStatus" AS ENUM ('DRAFT', 'ON_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "spkl_signers" (
    "id" TEXT NOT NULL,
    "role" "SpklSignerRole" NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "nip" TEXT,
    "position" TEXT,
    "department" TEXT,
    "workUnit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spkl_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spkls" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "picId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "type" "SpklType" NOT NULL DEFAULT 'WORKDAY',
    "workUnit" TEXT,
    "status" "SpklStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "totalHours" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "spkls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spkl_items" (
    "id" TEXT NOT NULL,
    "spklId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "workerNik" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "workerPosition" TEXT,
    "company" TEXT DEFAULT 'PT Bukit Energi Servis Terpadu',
    "taskDescription" TEXT NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spkl_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spkl_signers_role_isActive_idx" ON "spkl_signers"("role", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "spkls_number_key" ON "spkls"("number");

-- CreateIndex
CREATE INDEX "spkls_requesterId_status_idx" ON "spkls"("requesterId", "status");

-- CreateIndex
CREATE INDEX "spkls_status_idx" ON "spkls"("status");

-- CreateIndex
CREATE INDEX "spkl_items_spklId_idx" ON "spkl_items"("spklId");

-- AddForeignKey
ALTER TABLE "spkl_signers" ADD CONSTRAINT "spkl_signers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spkls" ADD CONSTRAINT "spkls_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spkls" ADD CONSTRAINT "spkls_picId_fkey" FOREIGN KEY ("picId") REFERENCES "spkl_signers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spkls" ADD CONSTRAINT "spkls_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "spkl_signers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spkl_items" ADD CONSTRAINT "spkl_items_spklId_fkey" FOREIGN KEY ("spklId") REFERENCES "spkls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
