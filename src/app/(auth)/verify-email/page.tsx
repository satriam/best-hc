'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Building2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';

function VerifyForm() {
  const token = useSearchParams().get('token') ?? '';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const confirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Verifikasi gagal');
      setEmail(result.data.email);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verifikasi gagal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 text-center">
      <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto mb-4">
        <Building2 className="w-6 h-6" />
      </div>
      <h1 className="text-2xl font-extrabold text-slate-900 mb-6">Verifikasi Email</h1>
      {!token ? (
        <p className="text-sm text-rose-600">Tautan tidak valid.</p>
      ) : email ? (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          <MailCheck className="w-5 h-5 mx-auto mb-2" />
          Email <strong>{email}</strong> berhasil diverifikasi.
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}
          <Button onClick={confirm} disabled={loading} className="w-full" size="lg">
            {loading ? 'Memproses...' : 'Konfirmasi Email'}
          </Button>
        </>
      )}
      <p className="text-xs mt-6">
        <Link href="/profile" className="text-indigo-600 hover:underline">Ke profil saya</Link>
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
      <Suspense fallback={<div className="text-white text-xs">Loading...</div>}>
        <VerifyForm />
      </Suspense>
    </div>
  );
}
