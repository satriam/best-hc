import React from 'react';
import { requireFeaturePage } from '@/services/feature.service';

export default async function LeaveRequestsFeatureLayout({ children }: { children: React.ReactNode }) {
  await requireFeaturePage('CUTI');
  return <>{children}</>;
}
