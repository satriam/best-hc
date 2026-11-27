import React from 'react';
import { getSession } from '@/lib/auth';
import { LaporanEditLoader } from '@/components/laporan/LaporanEditLoader';

/**
 * `/laporan/[id]/edit` — edit laporan tersimpan memakai wizard yang sama.
 *
 * Peran user diteruskan ke wizard (tombol tambah penanda tangan hanya ADMIN,
 * sesuai hak tulis API).
 */
export default async function LaporanEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();

  return <LaporanEditLoader id={id} isAdmin={session?.role === 'ADMIN'} />;
}
