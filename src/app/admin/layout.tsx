import React from 'react';
import { redirect } from 'next/navigation';
import { getSession, getImpersonation } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  if (session.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const impersonation = await getImpersonation();

  return <AppLayout user={session} impersonatedBy={impersonation?.adminName}>{children}</AppLayout>;
}
