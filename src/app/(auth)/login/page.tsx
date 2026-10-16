'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, LoginInput } from '@/schemas/auth.schema';
import { Building2, Lock, Mail, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Login gagal');
      }

      if (result.data.role === 'ADMIN') {
        router.push('/admin/dashboard');
      } else {
        router.push(callbackUrl || '/dashboard');
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillDemoAccount = (email: string, pass: string) => {
    setValue('email', email);
    setValue('password', pass);
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-8 relative z-10">
      {/* Header Branding */}
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-indigo-600/30">
          <Building2 className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Best HCM</h1>
        <p className="text-xs text-slate-500 mt-1">
          Human Capital Management & System Cuti Karyawan
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              {...register('email')}
              type="email"
              placeholder="email@besthcm.com"
              className="w-full h-10 pl-10 pr-3.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {errors.email && <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Password</label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              {...register('password')}
              type="password"
              placeholder="••••••••"
              className="w-full h-10 pl-10 pr-3.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {errors.password && <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>}
        </div>

        <Button type="submit" disabled={loading} className="w-full mt-2" size="lg">
          {loading ? 'Memproses...' : 'Masuk Aplikasi'}
          {!loading && <ArrowRight className="w-4 h-4 ml-1" />}
        </Button>
      </form>

      {/* Demo Quick Accounts */}
      <div className="mt-8 pt-6 border-t border-slate-100">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3 text-center">
          Pilih Akun Demo Quick Login
        </p>
        <div className="space-y-2">
          <button
            onClick={() => fillDemoAccount('user1@besthcm.com', 'user123')}
            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-left transition-colors group cursor-pointer"
          >
            <div>
              <p className="text-xs font-semibold text-slate-800 group-hover:text-indigo-900">
                Satria (User / Karyawan)
              </p>
              <p className="text-[11px] text-slate-500">user1@besthcm.com</p>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-700">
              USER
            </span>
          </button>

          <button
            onClick={() => fillDemoAccount('admin@besthcm.com', 'admin123')}
            className="w-full flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-left transition-colors group cursor-pointer"
          >
            <div>
              <p className="text-xs font-semibold text-slate-800 group-hover:text-indigo-900">
                Admin HCM (Administrator)
              </p>
              <p className="text-[11px] text-slate-500">admin@besthcm.com</p>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">
              ADMIN
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden font-sans">
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-600/20 blur-3xl rounded-full pointer-events-none" />
      <Suspense fallback={<div className="text-white text-xs">Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
