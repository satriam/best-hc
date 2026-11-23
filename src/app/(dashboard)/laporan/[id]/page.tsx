import React from 'react';
import { LaporanDetailView } from '@/components/laporan/LaporanDetailView';

/** `/laporan/[id]` — detail laporan bulanan (data dimuat client via API). */
export default async function LaporanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <LaporanDetailView id={id} />;
}
