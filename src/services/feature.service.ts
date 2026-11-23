import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { FEATURE_KEYS, FeatureKey, hasFeature, isFeatureKey } from '@/lib/features';

/** Fitur user dari DB (bukan dari JWT) supaya perubahan admin langsung berlaku. */
export async function getUserFeatures(userId: string): Promise<FeatureKey[]> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { features: true, role: true } });
  if (!user) return [];
  if (user.role === 'ADMIN') return [...FEATURE_KEYS];
  return user.features.filter(isFeatureKey);
}

export async function listUserFeatures() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, role: 'USER' },
    select: { id: true, name: true, email: true, nip: true, workUnit: true, features: true },
    orderBy: { name: 'asc' },
  });
  return users.map((u) => ({ ...u, features: u.features.filter(isFeatureKey) }));
}

export async function setUserFeatures(userId: string, features: string[]) {
  const clean = Array.from(new Set(features.filter(isFeatureKey)));
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new Error('User tidak ditemukan');
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { features: clean },
    select: { id: true, features: true },
  });
  return updated;
}

/** Guard halaman: redirect ke /dashboard bila user tidak punya fitur. */
export async function requireFeaturePage(key: FeatureKey) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'ADMIN') return session;
  const features = await getUserFeatures(session.id);
  if (!hasFeature({ role: session.role, features }, key)) redirect('/dashboard');
  return session;
}

/** Guard API: kembalikan response 403 bila user tidak punya fitur, atau null bila boleh. */
export async function featureForbidden(
  session: { id: string; role: string },
  key: FeatureKey
): Promise<NextResponse | null> {
  if (session.role === 'ADMIN') return null;
  const features = await getUserFeatures(session.id);
  if (hasFeature({ role: session.role, features }, key)) return null;
  return NextResponse.json(
    { success: false, message: 'Fitur ini tidak diaktifkan untuk akun Anda' },
    { status: 403 }
  );
}
