/**
 * Verifikasi arsip Google Drive + bersihkan data uji.
 *
 * Jalankan (dev):
 *   ./node_modules/.bin/tsx scripts/laporan/verify-drive.ts list
 *   ./node_modules/.bin/tsx scripts/laporan/verify-drive.ts delete <fileId>
 *   ./node_modules/.bin/tsx scripts/laporan/verify-drive.ts cleanup
 *
 * `list`   : panggil `files.list?q='<folder>' in parents` untuk folder
 *            "Laporan Bulanan" (GDRIVE_LAPORAN_FOLDER_ID).
 * `delete` : hapus satu file uji dari Drive.
 * `cleanup`: hapus baris `laporan_bulanan` hasil uji (period 2026-11) setelah
 *            file Drive-nya dihapus.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { config as loadEnv } from 'dotenv';
import {
  deleteDriveFile,
  getLaporanFolderId,
  listDriveFiles,
} from '../../src/services/google-drive.service';

loadEnv({ path: process.env.ENV_FILE ?? '.env.development' });
loadEnv({ path: '.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function list() {
  const folderId = getLaporanFolderId();
  const files = await listDriveFiles(folderId);
  console.log(`folder Laporan Bulanan: ${folderId}`);
  console.log(`jumlah file: ${files.length}`);
  for (const file of files) {
    console.log(`- ${file.name} | id=${file.id} | ${file.sizeBytes} B | ${file.webViewLink}`);
  }
}

async function remove(fileId: string) {
  const result = await deleteDriveFile(fileId);
  console.log('hapus file Drive:', result);
}

async function cleanup() {
  const rows = await prisma.laporanBulanan.findMany({
    where: { period: '2026-11' },
    select: { id: true, period: true, projectName: true, status: true, driveFileId: true },
  });
  console.log('baris uji ditemukan:', rows.length);
  for (const row of rows) {
    if (row.driveFileId) {
      const result = await deleteDriveFile(row.driveFileId);
      console.log(`- file Drive ${row.driveFileId} dihapus=${result.deleted}`);
    }
    await prisma.laporanBulanan.delete({ where: { id: row.id } });
    console.log(`- baris ${row.id} (${row.period}, ${row.status}) dihapus`);
  }

  const remainingSigners = await prisma.laporanSigner.count({ where: { name: { startsWith: '[TEST]' } } });
  const remainingLaporan = await prisma.laporanBulanan.count();
  const masterSigners = await prisma.laporanSigner.count();
  console.log(
    `sisa: laporan_bulanan=${remainingLaporan}, signer [TEST]=${remainingSigners}, master signer=${masterSigners}`
  );
}

const [action, arg] = process.argv.slice(2);

async function main() {
  if (action === 'list') return list();
  if (action === 'delete' && arg) return remove(arg);
  if (action === 'cleanup') return cleanup();
  console.error('usage: verify-drive.ts list|delete <fileId>|cleanup');
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('gagal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
