'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, X, XCircle } from 'lucide-react';

export interface ToastMessage {
  type: 'success' | 'error';
  text: string;
}

/**
 * Notifikasi ringan bergaya best-hcm (inline banner di halaman). Dipakai
 * menggantikan `alert()`: muncul di atas konten, bisa ditutup, hilang otomatis.
 */
export function LaporanToast({
  toast,
  onClose,
  duration = 6000,
}: {
  toast: ToastMessage | null;
  onClose: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [toast, duration, onClose]);

  if (!toast) return null;

  const success = toast.type === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="laporan-toast"
      className={`p-3 rounded-xl border flex items-start gap-2 text-xs font-semibold ${
        success
          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
          : 'bg-rose-50 border-rose-200 text-rose-900'
      }`}
    >
      {success ? (
        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
      ) : (
        <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
      )}
      <span className="leading-relaxed flex-1">{toast.text}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Tutup notifikasi"
        className="p-0.5 rounded text-current/70 hover:bg-black/5 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Pasangan hook + state untuk `<LaporanToast />`. */
export function useLaporanToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((type: ToastMessage['type'], text: string) => {
    setToast({ type, text });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  return { toast, showToast, clearToast };
}
