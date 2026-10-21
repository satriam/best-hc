-- AlterTable
ALTER TABLE "spkl_items" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "position" TEXT;

-- CreateIndex
CREATE INDEX "spkl_items_userId_idx" ON "spkl_items"("userId");

-- AddForeignKey
ALTER TABLE "spkl_items" ADD CONSTRAINT "spkl_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
