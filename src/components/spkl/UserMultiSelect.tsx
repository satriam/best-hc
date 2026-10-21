'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';
import type { UserOption } from './types';

/** Batas jumlah baris yang dirender sekaligus — sisanya lewat pencarian. */
const MAX_VISIBLE = 60;

interface UserMultiSelectProps {
  /** Semua user yang bisa dipilih (hasil GET /api/users). */
  users: UserOption[];
  /** id user yang sedang terpilih. */
  value: string[];
  onChange: (next: string[]) => void;
  inputId?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Pesan saat daftar user kosong. */
  emptyText?: string;
}

/**
 * Multi-select user dengan chip + pencarian.
 *
 * - Chip user terpilih di dalam kotak (klik × untuk melepas).
 * - Dropdown bisa dicari berdasarkan nama/email dan bisa mencentang banyak user.
 * - Daftar panjang tidak dirender semua (dibatasi MAX_VISIBLE lalu disaring saat mengetik).
 * - Dropdown dirender lewat portal `position: fixed` supaya tidak terpotong
 *   oleh `overflow-hidden` milik Modal.
 */
export function UserMultiSelect({
  users,
  value,
  onChange,
  inputId,
  placeholder = 'Cari nama atau email…',
  disabled = false,
  emptyText = 'Belum ada user yang bisa dipilih.',
}: UserMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = `user-multiselect-${useId().replace(/:/g, '')}`;

  const byId = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const selected = useMemo(
    () => value.map((id) => byId.get(id)).filter((user): user is UserOption => Boolean(user)),
    [value, byId]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? users.filter(
          (user) =>
            user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle)
        )
      : users;
    return list.slice(0, MAX_VISIBLE);
  }, [users, query]);

  const measure = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setAnchor({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  // Tutup saat klik di luar / Escape / posisi berubah.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      const dropdown = document.getElementById(listboxId);
      if (dropdown?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, measure, listboxId]);

  const toggle = useCallback(
    (userId: string) => {
      onChange(
        value.includes(userId) ? value.filter((id) => id !== userId) : [...value, userId]
      );
    },
    [onChange, value]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // Jangan teruskan ke Modal (Modal menutup diri saat Escape).
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      const target = filtered[activeIndex];
      if (target) {
        event.preventDefault();
        toggle(target.id);
        setQuery('');
      }
    }
  };

  const dropdown = open && anchor && typeof document !== 'undefined'
    ? createPortal(
        <div
          id={listboxId}
          role="listbox"
          aria-multiselectable="true"
          style={{ position: 'fixed', top: anchor.top, left: anchor.left, width: anchor.width }}
          className="z-[60] max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-500">
              {query.trim()
                ? `Tidak ada user yang cocok dengan "${query.trim()}".`
                : emptyText}
            </p>
          ) : (
            filtered.map((user, index) => {
              const checked = value.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    toggle(user.id);
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                    index === activeIndex ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-900">
                      {user.name}
                    </span>
                    <span className="block truncate text-[10px] text-slate-500">{user.email}</span>
                  </span>
                </button>
              );
            })
          )}

          <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/95 px-3 py-2 backdrop-blur">
            <span className="text-[10px] font-semibold text-slate-500">
              {value.length > 0 ? `${value.length} user dipilih` : 'Belum ada yang dipilih'}
            </span>
            <div className="flex items-center gap-2">
              {filtered.length === MAX_VISIBLE && (
                <span className="text-[10px] text-slate-400">
                  {MAX_VISIBLE} pertama — ketik untuk mempersempit
                </span>
              )}
              {value.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-[10px] font-bold text-rose-600 hover:text-rose-800"
                >
                  Lepas semua
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={containerRef} className="relative">
      <div
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          inputRef.current?.focus();
        }}
        className={`flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors focus-within:border-transparent focus-within:ring-2 focus-within:ring-indigo-500 ${
          disabled ? 'border-slate-200 bg-slate-50' : 'border-slate-300 bg-white'
        }`}
      >
        {selected.map((user) => (
          <span
            key={user.id}
            className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-800"
          >
            {user.name}
            <button
              type="button"
              disabled={disabled}
              aria-label={`Lepas ${user.name}`}
              title={`Lepas ${user.name}`}
              onClick={(event) => {
                event.stopPropagation();
                toggle(user.id);
              }}
              className="rounded-full p-0.5 text-indigo-500 hover:bg-indigo-100 hover:text-indigo-900 disabled:opacity-40"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={query}
          disabled={disabled}
          placeholder={selected.length === 0 ? placeholder : ''}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="min-w-[90px] flex-1 bg-transparent py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
        />

        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {dropdown}
    </div>
  );
}
