import React from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { getUserFeatures } from '@/services/feature.service';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  const features = await getUserFeatures(session.id);

  return (
    <AppLayout user={session} features={features}>
      {children}
    </AppLayout>
  );
}
