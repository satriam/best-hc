import React from 'react';
import { requireFeaturePage } from '@/services/feature.service';

export default async function SpklFeatureLayout({ children }: { children: React.ReactNode }) {
  await requireFeaturePage('SPKL');
  return <>{children}</>;
}
