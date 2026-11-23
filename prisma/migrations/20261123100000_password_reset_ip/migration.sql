-- AlterTable
ALTER TABLE "password_reset_tokens" ADD COLUMN "ip" TEXT;

-- CreateIndex
CREATE INDEX "password_reset_tokens_ip_createdAt_idx" ON "password_reset_tokens"("ip", "createdAt");
