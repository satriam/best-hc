/**
 * Tipe data modul SPKL untuk sisi UI.
 *
 * Bentuk ini mengikuti respons API yang sudah ada:
 *  - GET  /api/spkl            → `data: SpklListItem[]`, `pagination`
 *  - GET  /api/spkl/[id]       → `data: SpklDetail`
 *  - GET  /api/spkl-signers    → `data: SpklSigner[]`
 * Jangan menambah field yang tidak dikirim API.
 */

export type SpklTypeValue = 'WORKDAY' | 'OUTSIDE_WORKDAY' | 'PUBLIC_HOLIDAY';

export type SpklStatusValue = 'DRAFT' | 'ON_PROGRESS' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type SpklSignerRoleValue = 'PIC' | 'APPROVER';

/** Tautan penanda tangan ↔ user akun (pivot `spkl_signer_users`). */
export interface SpklSignerUserLink {
  /** id baris pivot (bukan id user). */
  id: string;
  userId: string;
  name: string;
  email: string;
}

/** Ringkasan penanda tangan yang ditempel pada SPKL (select `signerSummary`). */
export interface SpklSignerSummary {
  id: string;
  name: string;
  nip: string | null;
  position: string | null;
  department: string | null;
  workUnit: string | null;
  /** Semua user akun yang terhubung (bisa lebih dari satu). */
  users: SpklSignerUserLink[];
  /** Versi ringkas `users` → id user, untuk pengecekan hak akses. */
  userIdList: string[];
}

/** Master penanda tangan lengkap (GET /api/spkl-signers). */
export interface SpklSigner extends SpklSignerSummary {
  role: SpklSignerRoleValue;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Satu baris rincian pekerja (GET /api/spkl/[id]). */
export interface SpklItem {
  id?: string;
  order?: number;
  /** User akun yang diwakili baris ini (null = pekerja alih daya manual). */
  userId?: string | null;
  workerNik: string;
  workerName: string;
  workerPosition?: string | null;
  company?: string | null;
  taskDescription: string;
  /** ISO string (UTC midnight) — pakai `toDateKey` untuk nilai input date. */
  workDate: string;
  startTime: string;
  endTime: string;
  /** Dihitung server; UI hanya menampilkan. */
  hours: number;
}

/** Field yang sama pada list maupun detail. */
export interface SpklBase {
  id: string;
  number: string;
  requesterId: string;
  picId: string;
  approverId: string;
  type: SpklTypeValue;
  workUnit: string | null;
  status: SpklStatusValue;
  notes: string | null;
  totalHours: number;
  approvedAt: string | null;
  approvedById: string | null;
  rejectedNote: string | null;
  createdAt: string;
  updatedAt: string;
  pic: SpklSignerSummary;
  approver: SpklSignerSummary;
  requester: { id: string; name: string; email: string };
}

/** Satu baris pada tabel daftar SPKL. */
export interface SpklListItem extends SpklBase {
  itemCount: number;
  workerCount: number;
  items: Array<{ workerNik: string; workerName: string; workDate: string; hours: number }>;
}

/** Detail SPKL lengkap dengan seluruh baris rincian. */
export interface SpklDetail extends SpklBase {
  items: SpklItem[];
}

export interface SpklPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** User yang sedang login (GET /api/auth/me). */
export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  nip?: string | null;
  position?: string | null;
  workUnit?: string | null;
}

/** Baris pilihan pada form (id user untuk select `userId` di master penanda tangan). */
export interface UserOption {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  /** Data tambahan dari GET /api/users — dipakai untuk mengisi form otomatis. */
  nip?: string | null;
  position?: string | null;
  workUnit?: string | null;
}
