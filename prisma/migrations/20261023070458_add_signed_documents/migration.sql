-- CreateEnum
CREATE TYPE "SignedDocumentEntityType" AS ENUM ('SPKL', 'LEAVE_REQUEST');

-- CreateTable
CREATE TABLE "signed_documents" (
    "id" TEXT NOT NULL,
    "entityType" "SignedDocumentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "driveWebViewLink" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "signed_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signed_documents_driveFileId_key" ON "signed_documents"("driveFileId");

-- CreateIndex
CREATE INDEX "signed_documents_entityType_entityId_isActive_idx" ON "signed_documents"("entityType", "entityId", "isActive");

-- AddForeignKey
ALTER TABLE "signed_documents" ADD CONSTRAINT "signed_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
