'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { apiErrorMessage } from '@/components/laporan/laporan-ui';

interface DocPreviewModalProps {
  /** ID laporan yang dipratinjau; `null` = tertutup. */
  id: string | null;
  title?: string;
  onClose: () => void;
}

/** Pratinjau .docx laporan di modal (render client lewat docx-preview). */
export function DocPreviewModal({ id, title, onClose }: DocPreviewModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ id: string; error: string | null } | null>(null);
  const loading = id !== null && state?.id !== id;
  const error = id !== null && state?.id === id ? state.error : null;

  useEffect(() => {
    if (!id) return;
    let active = true;

    (async () => {
      try {
        const response = await fetch(`/api/laporan/${id}/preview`);
        if (!response.ok) {
          const json = await response.json().catch(() => null);
          throw new Error(apiErrorMessage(json, 'Gagal memuat pratinjau'));
        }
        const blob = await response.blob();
        const { renderAsync } = await import('docx-preview');
        if (!active || !bodyRef.current) return;
        bodyRef.current.innerHTML = '';
        await renderAsync(blob, bodyRef.current, styleRef.current ?? undefined, {
          inWrapper: true,
          ignoreWidth: false,
          breakPages: true,
        });
        if (active) setState({ id, error: null });
      } catch (err: unknown) {
        if (active) {
          setState({ id, error: err instanceof Error ? err.message : 'Gagal memuat pratinjau' });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', onKey);
    };
  }, [id, onClose]);

  if (!id) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau dokumen"
    >
      <div className="w-full max-w-5xl h-[90vh] bg-white rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60">
          <h3 className="text-sm font-bold text-slate-900 truncate">Pratinjau{title ? ` — ${title}` : ''}</h3>
          <button
            onClick={onClose}
            aria-label="Tutup pratinjau"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="relative flex-1 overflow-auto bg-slate-200">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat pratinjau...
            </div>
          )}
          {error && <p className="p-6 text-xs font-semibold text-rose-700">{error}</p>}
          <div ref={styleRef} />
          <div ref={bodyRef} />
        </div>
      </div>
    </div>
  );
}
