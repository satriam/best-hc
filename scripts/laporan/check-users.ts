#!/usr/bin/env node
/**
 * Diagnostik cepat untuk uji E2E: daftar user di database aktif + cek apakah
 * password default seed (`admin123` / `user123`) masih berlaku.
 *
 * Jalankan: ./node_modules/.bin/tsx scripts/laporan/check-users.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: process.env.ENV_FILE ?? '.env.development' });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL kosong');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, role: true, password: true, name: true },
    orderBy: { email: 'asc' },
  });
  console.log('total user:', users.length);
  for (const user of users) {
    const admin = bcrypt.compareSync('admin123', user.password);
    const biasa = bcrypt.compareSync('user123', user.password);
    console.log(
      `${user.email.padEnd(28)} role=${user.role.padEnd(5)} admin123=${admin} user123=${biasa}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
