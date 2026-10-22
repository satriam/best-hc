'use client';

import React from 'react';
import { Users } from 'lucide-react';
import type { SpklSignerUserLink } from './types';

/**
 * Ringkas daftar user terhubung menjadi teks pendek.
 * Contoh: `Satria, Pahlawan (+2)`; daftar kosong → `—`.
 */
export function formatSignerUsers(
  users: SpklSignerUserLink[] | null | undefined,
  max = 2
): string {
  const list = users ?? [];
  if (list.length === 0) return '—';

  const names = list.slice(0, max).map((user) => user.name);
  const rest = list.length - names.length;
  return rest > 0 ? `${names.join(', ')} (+${rest})` : names.join(', ');
}

interface SignerUsersHintProps {
  users?: SpklSignerUserLink[] | null;
  label?: string;
  /** `line` = satu baris teks kecil; `chips` = chip per user. */
  variant?: 'line' | 'chips';
}

/**
 * Info kecil "Terhubung ke: …" di bawah dropdown PIC/penyetuju pada form SPKL,
 * dan chip daftar user pada halaman detail SPKL.
 */
export function SignerUsersHint({ users, label = 'Terhubung ke', variant = 'line' }: SignerUsersHintProps) {
  const list = users ?? [];

  if (variant === 'chips') {
    if (list.length === 0) {
      return (
        <p className="mt-1.5 text-[10px] text-slate-400">
          <span className="font-semibold text-slate-500">{label}:</span> —
        </p>
      );
    }

    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-semibold text-slate-500">{label}:</span>
        {list.map((user) => (
          <span
            key={user.userId}
            title={user.email}
            className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800"
          >
            {user.name}
          </span>
        ))}
      </div>
    );
  }

  return (
    <p className="flex items-start gap-1 text-[11px] text-slate-600">
      <Users className="mt-0.5 h-3 w-3 shrink-0 text-indigo-500" />
      <span className="min-w-0">
        <span className="font-semibold text-slate-500">{label}:</span>{' '}
        <span title={list.map((user) => user.name).join(', ') || undefined}>
          {formatSignerUsers(list)}
        </span>
      </span>
    </p>
  );
}
