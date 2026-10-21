/**
 * Seed master penanda tangan SPKL (PIC & penyetuju) TANPA menghapus data lain.
 *
 *   DATABASE_URL="postgresql://...:5433/besthcm_dev" \
 *     ./node_modules/.bin/tsx scripts/seed-spkl-signers.ts
 *
 * Idempoten: aman dijalankan berulang. Data dicocokkan berdasarkan
 * `role` + `name`, jadi menjalankan ulang tidak membuat duplikat.
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import { SpklSignerRole } from '@prisma/client';

const SIGNERS = [
  {
    role: SpklSignerRole.PIC,
    name: 'Krisman Hutagaol',
    nip: '7796130645',
    position: 'VEGETATION MANAGEMENT SEC. HEAD',
    department: 'VEGETATION MANAGEMENT SEC. HEAD',
    workUnit: 'FMWR',
    isActive: true,
    isDefault: true,
    sortOrder: 0,
  },
  {
    role: SpklSignerRole.APPROVER,
    name: 'Maufiroh Titik Khotimah',
    nip: '8409230759',
    position: 'FORESTRY MGMT & WATERSHED REH DEPT. HEAD',
    department: 'FORESTRY MGMT & WATERSHED REH DEPT. HEAD',
    workUnit: 'FMWR',
    isActive: true,
    isDefault: true,
    sortOrder: 0,
  },
];

async function main() {
  for (const signer of SIGNERS) {
    const existing = await prisma.spklSigner.findFirst({
      where: { role: signer.role, name: signer.name },
      select: { id: true },
    });

    if (existing) {
      await prisma.spklSigner.update({ where: { id: existing.id }, data: signer });
      console.log(`  · diperbarui: ${signer.role} ${signer.name}`);
    } else {
      await prisma.spklSigner.create({ data: signer });
      console.log(`  · dibuat     : ${signer.role} ${signer.name}`);
    }
  }

  const total = await prisma.spklSigner.count();
  console.log(`Selesai. Total master penanda tangan SPKL: ${total}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
