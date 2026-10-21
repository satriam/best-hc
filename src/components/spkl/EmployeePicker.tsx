'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, PencilLine, Search, X } from 'lucide-react';
import type { UserOption } from './types';

/** Tinggi maksimum daftar opsi (px) — sisanya di-scroll. */
const LIST_MAX_HEIGHT = 280;
/** Lebar minimum panel supaya "NIP · Jabatan" tidak terpotong di kolom sempit. */
const PANEL_MIN_WIDTH = 288;
/** Jarak panel dari kotak pemicu (px). */
const PANEL_GAP = 4;
/** Ruang minimum yang layak untuk membuka panel ke bawah. */
const MIN_SPACE = 160;

/** Baris "isi manual" (pekerja alih daya) di paling bawah daftar. */
const MANUAL_ID = '__manual__';

interface EmployeePickerProps {
  /** Daftar user dari GET /api/users/options. */
  users: UserOption[];
  /** id user terpilih; string kosong = isi manual (pekerja alih daya). */
  value: string;
  onChange: (userId: string) => void;
  /** aria-label untuk kotak & panel (mis. "Karyawan baris 1"). */
  label: string;
  placeholder?: string;
}

type PickerOption =
  | { kind: 'user'; id: string; user: UserOption }
  | { kind: 'manual'; id: string };

interface PanelAnchor {
  left: number;
  width: number;
  /** Panel dibuka ke bawah (pakai `top`) atau ke atas (pakai `bottom`). */
  top?: number;
  bottom?: number;
  maxHeight: number;
}

/**
 * Combobox satu pilihan untuk memilih karyawan (user akun) pada baris SPKL.
 *
 * - Tertutup: kotak bergaya `select` — chevron di kanan, placeholder
 *   "Pilih karyawan…", atau nama karyawan terpilih + tombol ✕.
 * - Terbuka: panel dengan kolom pencarian (autofocus, cari nama/NIP),
 *   daftar opsi (nama tebal + "NIP · Jabatan"), scroll maksimal 280px,
 *   navigasi ↑ ↓ Enter Esc, klik di luar menutup.
 * - Opsi "Isi manual" di paling bawah mengosongkan `userId` supaya NIK/Nama/
 *   Jabatan bisa diisi manual untuk pekerja alih daya.
 *
 * Panel dirender lewat portal `position: fixed` agar tidak terpotong oleh
 * `overflow-x-auto` tabel dan `overflow-hidden` milik Card.
 */
export function EmployeePicker({
  users,
  value,
  onChange,
  label,
  placeholder = 'Pilih karyawan…',
}: EmployeePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchor, setAnchor] = useState<PanelAnchor | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  /** Panel baru dibuka → fokuskan kolom pencarian begitu panel ter-mount. */
  const focusPendingRef = useRef(false);

  const uid = useId().replace(/:/g, '');
  const listboxId = `spkl-employee-listbox-${uid}`;
  const searchId = `spkl-employee-search-${uid}`;

  const selected = useMemo(
    () => users.find((user) => user.id === value) ?? null,
    [users, value]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(needle) ||
        `${user.nip ?? ''}`.toLowerCase().includes(needle)
    );
  }, [users, query]);

  const options = useMemo<PickerOption[]>(
    () => [
      ...filtered.map<PickerOption>((user) => ({ kind: 'user', id: user.id, user })),
      { kind: 'manual', id: MANUAL_ID },
    ],
    [filtered]
  );

  const activeOption = options[Math.min(activeIndex, options.length - 1)];
  const activeId = open && activeOption ? `${listboxId}-${activeOption.id}` : undefined;

  const measure = useCallback(() => {
    const element = boxRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - PANEL_GAP * 2;
    const spaceAbove = rect.top - PANEL_GAP * 2;
    const openUp = spaceBelow < MIN_SPACE && spaceAbove > spaceBelow;
    const available = Math.max(openUp ? spaceAbove : spaceBelow, MIN_SPACE);
    const maxHeight = Math.min(LIST_MAX_HEIGHT + 82, available);

    setAnchor({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, PANEL_MIN_WIDTH) - 8)),
      width: Math.max(rect.width, PANEL_MIN_WIDTH),
      ...(openUp ? { bottom: window.innerHeight - rect.top + PANEL_GAP } : { top: rect.bottom + PANEL_GAP }),
      maxHeight,
    });
  }, []);

  const openPanel = useCallback(() => {
    setQuery('');
    setActiveIndex(0);
    focusPendingRef.current = true;
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  // Fokus ke kolom pencarian setiap panel terbuka (panel baru ter-mount setelah
  // posisi terukur, jadi efek ini menunggu `anchor`).
  useEffect(() => {
    if (!open || !anchor) return;
    if (!focusPendingRef.current) return;
    const input = searchRef.current;
    if (!input) return;
    focusPendingRef.current = false;
    input.focus();
    input.select();
  }, [open, anchor]);

  // Tutup saat klik di luar, Escape, atau posisi berubah.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (boxRef.current?.contains(target)) return;
      const panel = document.getElementById(listboxId);
      if (panel?.contains(target)) return;
      closePanel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
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
  }, [open, measure, closePanel, listboxId]);

  // Pastikan opsi aktif tetap terlihat saat dinavigasi dengan keyboard.
  useEffect(() => {
    if (!open || !activeId) return;
    const element = listRef.current?.querySelector<HTMLElement>(`[data-option-id="${activeId}"]`);
    element?.scrollIntoView({ block: 'nearest' });
  }, [open, activeId]);

  const choose = useCallback(
    (option: PickerOption) => {
      onChange(option.kind === 'user' ? option.user.id : '');
      closePanel();
    },
    [onChange, closePanel]
  );

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // Jangan teruskan ke elemen induk (mis. Modal yang menutup diri saat Escape).
      event.stopPropagation();
      closePanel();
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, options.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(options.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[Math.min(activeIndex, options.length - 1)];
      if (option) choose(option);
      return;
    }
    if (event.key === 'Tab') {
      closePanel();
    }
  };

  const panel =
    open && anchor && typeof document !== 'undefined'
      ? createPortal(
          <div
            id={listboxId}
            style={{
              position: 'fixed',
              left: anchor.left,
              width: anchor.width,
              maxHeight: anchor.maxHeight,
              ...(anchor.top !== undefined ? { top: anchor.top } : { bottom: anchor.bottom }),
            }}
            className="z-[70] flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/15"
          >
            <div className="shrink-0 border-b border-slate-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  id={searchId}
                  ref={searchRef}
                  type="text"
                  role="combobox"
                  aria-label={`Cari karyawan — ${label}`}
                  aria-expanded={open}
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeId}
                  autoComplete="off"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Cari nama atau NIP…"
                  className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-7 pr-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div
              ref={listRef}
              role="listbox"
              aria-label={label}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {filtered.length === 0 && (
                <p className="px-3 py-3 text-center text-[11px] text-slate-500">
                  Tidak ada karyawan cocok
                </p>
              )}

              {filtered.map((user, index) => {
                const isActive = index === Math.min(activeIndex, options.length - 1);
                const isSelected = user.id === value;
                const nip = user.nip && user.nip !== '-' ? user.nip : '';
                const position = user.position && user.position !== '-' ? user.position : '';
                const meta = [nip, position].filter(Boolean).join(' · ');

                return (
                  <button
                    key={user.id}
                    type="button"
                    role="option"
                    id={`${listboxId}-${user.id}`}
                    data-option-id={`${listboxId}-${user.id}`}
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose({ kind: 'user', id: user.id, user })}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors ${
                      isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-indigo-600">
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-900">
                        {user.name}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {meta || user.email}
                      </span>
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                role="option"
                id={`${listboxId}-${MANUAL_ID}`}
                data-option-id={`${listboxId}-${MANUAL_ID}`}
                aria-selected={!value}
                onMouseEnter={() => setActiveIndex(options.length - 1)}
                onClick={() => choose({ kind: 'manual', id: MANUAL_ID })}
                className={`flex w-full items-start gap-2 border-t border-slate-100 px-3 py-2 text-left transition-colors ${
                  activeIndex >= options.length - 1 ? 'bg-indigo-50' : 'hover:bg-slate-50'
                }`}
              >
                <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-indigo-600">
                  {!value && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-xs font-semibold text-slate-900">
                    <PencilLine className="h-3 w-3 text-slate-500" /> Isi manual
                  </span>
                  <span className="block text-[10px] text-slate-500">
                    Pekerja alih daya — NIK, nama &amp; jabatan diisi sendiri
                  </span>
                </span>
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={boxRef} className="relative">
      <div
        className={`flex w-full items-center rounded-md border bg-white transition-colors ${
          open
            ? 'border-transparent ring-2 ring-indigo-500'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-label={`${label}: ${selected ? selected.name : 'belum dipilih'}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          onClick={() => {
            if (open) closePanel();
            else openPanel();
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && !open) {
              event.preventDefault();
              openPanel();
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1.5 text-left focus:outline-none"
        >
          <span
            className={`block min-w-0 flex-1 truncate text-xs ${
              selected ? 'font-semibold text-slate-900' : 'text-slate-400'
            }`}
          >
            {selected ? selected.name : placeholder}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {selected && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              closePanel();
            }}
            title="Lepas pilihan (isi manual untuk pekerja alih daya)"
            aria-label={`Lepas karyawan ${selected.name}`}
            className="mr-1 rounded p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {panel}
    </div>
  );
}
