import React from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  return <AppLayout user={session}>{children}</AppLayout>;
}
