-- AlterTable
ALTER TABLE "laporan_bulanan" ADD COLUMN     "needsDriveSync" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "laporan_defaults" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "projectName" TEXT NOT NULL DEFAULT '',
    "coverTitle" TEXT NOT NULL DEFAULT '',
    "docTitle" TEXT NOT NULL DEFAULT '',
    "docNo" TEXT,
    "spphNo" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "dibuatSignerId" TEXT,
    "diperiksaSignerId" TEXT,
    "disetujuiSignerId" TEXT,
    "disetujui2SignerId" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laporan_defaults_pkey" PRIMARY KEY ("id")
);
