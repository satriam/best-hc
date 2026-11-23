'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AuthBackground } from '@/components/auth/AuthBackground';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Password minimal 8 karakter');
    if (password !== confirm) return setError('Konfirmasi password tidak sama');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Gagal reset password');
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal reset password');
    } finally {
      setLoading(false);
    }
  };

  const field = (value: string, set: (v: string) => void, placeholder: string) => (
    <div className="relative">
      <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
      <input
        type="password"
        required
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-10 pr-3.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );

  return (
    <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-indigo-950/50 border border-white/20 ring-1 ring-white/10 p-8">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto mb-4">
          <Building2 className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900">Reset Password</h1>
      </div>

      {!token ? (
        <p className="text-sm text-rose-600 text-center">Tautan tidak valid.</p>
      ) : done ? (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
          Password berhasil diubah. Mengalihkan ke halaman login...
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}
          {field(password, setPassword, 'Password baru (min. 8 karakter)')}
          {field(confirm, setConfirm, 'Ulangi password baru')}
          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? 'Menyimpan...' : 'Simpan Password'}
          </Button>
        </form>
      )}
      <p className="text-center text-xs mt-6">
        <Link href="/login" className="text-indigo-600 hover:underline">Kembali ke login</Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthBackground>
      <Suspense fallback={<div className="text-white text-xs">Loading...</div>}>
        <ResetForm />
      </Suspense>
    </AuthBackground>
  );
}
