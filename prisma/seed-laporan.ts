/**
 * Seed master penanda tangan Laporan Bulanan.
 *
 * Hanya menambah data bila tabel `laporan_signers` masih kosong — tidak pernah
 * menimpa penanda tangan yang sudah diubah admin lewat UI.
 *
 * Jalankan (dev):
 *   ./node_modules/.bin/tsx prisma/seed-laporan.ts
 *   ENV_FILE=.env.production ./node_modules/.bin/tsx prisma/seed-laporan.ts
 */
import { PrismaClient, LaporanSignerRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config as loadEnv } from 'dotenv';

// `tsx` tidak memuat .env.<NODE_ENV> seperti Next.js, jadi pilih file eksplisit.
loadEnv({ path: process.env.ENV_FILE ?? '.env.development' });
loadEnv({ path: '.env' });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL kosong. Set ENV_FILE atau ekspor DATABASE_URL dulu.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Data contoh mengikuti lembar persetujuan dokumen acuan: satu "Dibuat Oleh",
 * satu "Diperiksa Oleh", dan dua kolom "Disetujui Oleh" (Direktur + Dept Head).
 */
const SEED_SIGNERS = [
  {
    role: LaporanSignerRole.DIBUAT,
    name: 'Satria Mulya Adiwardana',
    position: 'Programmer Web',
    department: 'PT Bukit Energi Servis Terpadu',
    isDefault: true,
    sortOrder: 0,
  },
  {
    role: LaporanSignerRole.DIPERIKSA,
    name: 'Zulfikar Murakabiman',
    position: 'Programming Staff',
    department: 'PT Bukit Asam (Persero) Tbk',
    isDefault: true,
    sortOrder: 0,
  },
  {
    role: LaporanSignerRole.DISETUJUI,
    name: 'Zulkurniadi',
    position: 'Direktur',
    department: 'PT Bukit Energi Servis Terpadu',
    isDefault: true,
    sortOrder: 0,
  },
  {
    role: LaporanSignerRole.DISETUJUI,
    name: 'Dedek Apriyani',
    position: 'Application Development & Services/EIS Department Head',
    department: 'PT Bukit Asam (Persero) Tbk',
    isDefault: false,
    sortOrder: 1,
  },
];

async function main() {
  const total = await prisma.laporanSigner.count();
  if (total > 0) {
    console.log(`Seed dilewati: tabel laporan_signers sudah berisi ${total} baris.`);
    return;
  }

  for (const signer of SEED_SIGNERS) {
    const created = await prisma.laporanSigner.create({ data: signer });
    console.log(`+ ${created.role} — ${created.name} (${created.position ?? '-'})`);
  }

  console.log(`Selesai: ${SEED_SIGNERS.length} penanda tangan laporan ditambahkan.`);
}

main()
  .catch((error) => {
    console.error('Seed penanda tangan laporan gagal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
