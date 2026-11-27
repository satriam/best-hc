import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { FEATURE_KEYS } from '@/lib/features';
import { setUserFeatures } from '@/services/feature.service';

const bodySchema = z.object({
  features: z.array(z.enum(FEATURE_KEYS as [string, ...string[]])),
});

/** PUT /api/users/:id/features — ADMIN mengatur fitur yang tampil untuk user. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const { features } = bodySchema.parse(await request.json());
    const data = await setUserFeatures(id, features);
    return NextResponse.json({ success: true, message: 'Akses fitur disimpan', data });
  } catch (e) {
    const message = e instanceof Error && e.name !== 'ZodError' ? e.message : 'Data fitur tidak valid';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
