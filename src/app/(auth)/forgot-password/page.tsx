'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Building2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AuthBackground } from '@/components/auth/AuthBackground';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (!res.ok || !result.success) throw new Error(result.message || 'Gagal mengirim email');
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthBackground>
      <div className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl shadow-indigo-950/50 border border-white/20 ring-1 ring-white/10 p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto mb-4">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900">Lupa Password</h1>
          <p className="text-xs text-slate-500 mt-1">Masukkan email untuk menerima tautan reset.</p>
        </div>

        {message && (
          <div className="mb-6 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-700">
            {message}
          </div>
        )}
        {error && (
          <div className="mb-6 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@besthcm.com"
              className="w-full h-10 pl-10 pr-3.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? 'Mengirim...' : 'Kirim Tautan Reset'}
          </Button>
        </form>
        <p className="text-center text-xs mt-6">
          <Link href="/login" className="text-indigo-600 hover:underline">Kembali ke login</Link>
        </p>
      </div>
    </AuthBackground>
  );
}
