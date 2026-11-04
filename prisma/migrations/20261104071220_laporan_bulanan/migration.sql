-- CreateEnum
CREATE TYPE "LaporanSignerRole" AS ENUM ('DIBUAT', 'DIPERIKSA', 'DISETUJUI');

-- CreateTable
CREATE TABLE "laporan_signers" (
    "id" TEXT NOT NULL,
    "role" "LaporanSignerRole" NOT NULL,
    "name" TEXT NOT NULL,
    "nip" TEXT,
    "position" TEXT,
    "department" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laporan_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "laporan_bulanan" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "docNo" TEXT,
    "title" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "driveFileId" TEXT,
    "driveLink" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laporan_bulanan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "laporan_signers_role_isActive_idx" ON "laporan_signers"("role", "isActive");

-- CreateIndex
CREATE INDEX "laporan_bulanan_period_status_idx" ON "laporan_bulanan"("period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "laporan_bulanan_period_projectName_version_key" ON "laporan_bulanan"("period", "projectName", "version");
