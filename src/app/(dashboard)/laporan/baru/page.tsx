import React from 'react';
import { getSession } from '@/lib/auth';
import { LaporanWizard } from '@/components/laporan/LaporanWizard';

/**
 * `/laporan/baru` — wizard pembuatan laporan bulanan.
 *
 * Halaman ini server component tipis: hanya meneruskan peran user ke wizard
 * (tombol tambah penanda tangan hanya untuk ADMIN, sesuai hak tulis API).
 */
export default async function LaporanBaruPage() {
  const session = await getSession();

  return <LaporanWizard isAdmin={session?.role === 'ADMIN'} />;
}
