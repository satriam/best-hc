/**
 * Tipe data master penanda tangan cuti untuk sisi UI.
 * Mengikuti respons API:
 *  - GET  /api/cuti-signers        → `data: CutiSigner[]`
 *  - GET  /api/cuti-signers/[id]   → `data: CutiSigner`
 * Jangan menambah field yang tidak dikirim API.
 */

export type CutiSignerRoleValue = 'KNOWING' | 'APPROVER';

/** Tautan penanda tangan ↔ user akun (pivot `cuti_signer_users`). */
export interface CutiSignerUserLink {
  /** id baris pivot (bukan id user). */
  id: string;
  userId: string;
  name: string;
  email: string;
}

/** Master penanda tangan cuti lengkap (GET /api/cuti-signers). */
export interface CutiSigner {
  id: string;
  role: CutiSignerRoleValue;
  /** KNOWING = Mengetahui, APPROVER = Menyetujui. */
  name: string;
  nip: string | null;
  position: string | null;
  department: string | null;
  workUnit: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  users: CutiSignerUserLink[];
  userIdList: string[];
  createdAt?: string;
  updatedAt?: string;
}

/** User pilihan pada form (GET /api/users). */
export interface CutiSignerUserOption {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  nip?: string | null;
  position?: string | null;
  workUnit?: string | null;
}
