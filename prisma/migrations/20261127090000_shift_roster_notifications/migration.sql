-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('NON_SHIFT', 'SHIFT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "workType" "WorkType" NOT NULL DEFAULT 'NON_SHIFT',
ADD COLUMN "rosterPattern" TEXT,
ADD COLUMN "rosterStartDate" TIMESTAMP(3);

-- Pola roster: 2–28 huruf K/L dengan minimal satu hari kerja.
ALTER TABLE "users" ADD CONSTRAINT "users_rosterPattern_check"
  CHECK ("rosterPattern" IS NULL OR ("rosterPattern" ~ '^[KL]{2,28}$' AND POSITION('K' IN "rosterPattern") > 0));

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LEAVE_CREATED', 'DOCUMENT_UPLOADED');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "inBell" BOOLEAN NOT NULL DEFAULT true,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_recipientId_createdAt_idx" ON "notifications"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_recipientId_inBell_readAt_idx" ON "notifications"("recipientId", "inBell", "readAt");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
