-- CreateEnum
CREATE TYPE "CutiSignerRole" AS ENUM ('KNOWING', 'APPROVER');

-- CreateTable
CREATE TABLE "cuti_signers" (
    "id" TEXT NOT NULL,
    "role" "CutiSignerRole" NOT NULL,
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

    CONSTRAINT "cuti_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuti_signer_users" (
    "id" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "cuti_signer_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cuti_signers_role_isActive_idx" ON "cuti_signers"("role", "isActive");

-- CreateIndex
CREATE INDEX "cuti_signer_users_userId_idx" ON "cuti_signer_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "cuti_signer_users_signerId_userId_key" ON "cuti_signer_users"("signerId", "userId");

-- AddForeignKey
ALTER TABLE "cuti_signer_users" ADD CONSTRAINT "cuti_signer_users_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "cuti_signers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuti_signer_users" ADD CONSTRAINT "cuti_signer_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
