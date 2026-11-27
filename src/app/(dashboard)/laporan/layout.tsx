import React from 'react';
import { requireFeaturePage } from '@/services/feature.service';

export default async function LaporanFeatureLayout({ children }: { children: React.ReactNode }) {
  await requireFeaturePage('LAPORAN');
  return <>{children}</>;
}
