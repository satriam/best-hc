/**
 * Seed master penanda tangan CUTI (Mengetahui & Menyetujui) TANPA menghapus data lain.
 *
 *   set -a && . ./.env.development && set +a
 *   ./node_modules/.bin/tsx scripts/seed-cuti-signers.ts
 *
 * Idempoten: dicocokkan berdasarkan `role` + `name`, jadi aman dijalankan berulang.
 * Nilai awal = penanda tangan yang sebelumnya di-hardcode di template cetak cuti.
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import { CutiSignerRole } from '@prisma/client';

const SIGNERS = [
  {
    role: CutiSignerRole.APPROVER,
    name: 'Dedy Supriyatmoko',
    nip: '1082100018',
    position: 'Manajer Pengembangan Bisnis\n& Operational Excellence',
    department: 'Manajemen Pengembangan Bisnis & Operational Excellence',
    workUnit: null,
    isActive: true,
    isDefault: true,
    sortOrder: 0,
  },
  {
    role: CutiSignerRole.KNOWING,
    name: 'Dedek Apriyani',
    nip: '8913230864',
    position: 'Application Development & Services/EIS\nDepartment Head',
    department: 'Application Development & Services/EIS',
    workUnit: null,
    isActive: true,
    isDefault: true,
    sortOrder: 0,
  },
];

async function main() {
  for (const signer of SIGNERS) {
    const existing = await prisma.cutiSigner.findFirst({
      where: { role: signer.role, name: signer.name },
      select: { id: true },
    });

    if (existing) {
      await prisma.cutiSigner.update({ where: { id: existing.id }, data: signer });
      console.log(`  · diperbarui: ${signer.role} ${signer.name}`);
    } else {
      await prisma.cutiSigner.create({ data: signer });
      console.log(`  · dibuat     : ${signer.role} ${signer.name}`);
    }
  }

  const total = await prisma.cutiSigner.count();
  console.log(`Selesai. Total master penanda tangan cuti: ${total}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
