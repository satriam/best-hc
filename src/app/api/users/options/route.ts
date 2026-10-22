import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserOptions } from '@/services/user.service';

/**
 * GET /api/users/options — daftar user ringan untuk form SPKL.
 *
 * Boleh diakses SEMUA user yang login (dipakai form pembuatan SPKL untuk
 * auto-isi NIK/nama/jabatan), tetapi hanya mengembalikan kolom non-sensitif:
 * `id`, `name`, `nip`, `position`, `workUnit`. Tidak ada `email`, `role`,
 * maupun `password`.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const users = await getUserOptions();
  return NextResponse.json({ success: true, data: users });
}
