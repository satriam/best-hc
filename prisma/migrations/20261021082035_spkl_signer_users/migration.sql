-- Satu penanda tangan SPKL (PIC / APPROVER) kini bisa terhubung ke BANYAK user.
-- Urutan WAJIB: buat tabel pivot → backfill dari kolom lama → baru drop kolom lama,
-- supaya tautan user yang sudah ada tidak hilang.

-- CreateTable
CREATE TABLE "spkl_signer_users" (
    "id" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "spkl_signer_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spkl_signer_users_userId_idx" ON "spkl_signer_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "spkl_signer_users_signerId_userId_key" ON "spkl_signer_users"("signerId", "userId");

-- Backfill: setiap `spkl_signers.userId` lama menjadi satu baris pivot.
INSERT INTO "spkl_signer_users" ("id", "signerId", "userId")
SELECT gen_random_uuid()::text, "id", "userId"
FROM "spkl_signers"
WHERE "userId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "spkl_signers" DROP CONSTRAINT "spkl_signers_userId_fkey";

-- AlterTable
ALTER TABLE "spkl_signers" DROP COLUMN "userId";

-- AddForeignKey
ALTER TABLE "spkl_signer_users" ADD CONSTRAINT "spkl_signer_users_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "spkl_signers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spkl_signer_users" ADD CONSTRAINT "spkl_signer_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
