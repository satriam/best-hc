'use client';

import React, { useState } from 'react';
import { KeyRound, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Props {
  email: string;
  emailVerified: boolean;
}

const input =
  'w-full h-10 px-3.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed';
const label = 'block text-xs font-semibold text-slate-700 mb-1.5';
const hint = 'mt-1 text-[11px] text-slate-400';

type Msg = { type: 'ok' | 'err'; text: string } | null;

function Notice({ msg }: { msg: Msg }) {
  if (!msg) return null;
  const c =
    msg.type === 'ok'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : 'bg-rose-50 border-rose-200 text-rose-700';
  return <div className={`p-3 rounded-lg border text-xs font-medium ${c}`}>{msg.text}</div>;
}

function Section({
  icon: Icon,
  title,
  desc,
  footer,
  onSubmit,
  children,
}: {
  icon: React.ElementType;
  title: string;
  desc: string;
  footer: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-xl border border-slate-200/80 shadow-sm shadow-slate-100 overflow-hidden"
    >
      <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
      </div>
      <div className="p-6 space-y-4">{children}</div>
      <div className="px-6 py-4 bg-slate-50/60 border-t border-slate-100 flex items-center justify-end gap-3">
        {footer}
      </div>
    </form>
  );
}

async function send(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const r = await res.json();
  if (!res.ok || !r.success) throw new Error(r.message || 'Gagal');
  return r.message as string;
}

export function ProfileEditor(p: Props) {
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailMsg, setEmailMsg] = useState<Msg>(null);
  const [sending, setSending] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [savingPw, setSavingPw] = useState(false);

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setEmailMsg(null);
    try {
      const text = await send('/api/profile/email', {
        password: emailPassword,
        ...(newEmail ? { newEmail } : {}),
      });
      setEmailMsg({ type: 'ok', text });
      setEmailPassword('');
      setNewEmail('');
    } catch (err) {
      setEmailMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal' });
    } finally {
      setSending(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword.length < 8) return setPwMsg({ type: 'err', text: 'Password baru minimal 8 karakter' });
    if (newPassword !== confirmPassword)
      return setPwMsg({ type: 'err', text: 'Konfirmasi password tidak sama' });
    setSavingPw(true);
    try {
      const text = await send('/api/profile/password', { currentPassword, newPassword });
      setPwMsg({ type: 'ok', text });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal' });
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="space-y-6">
      <Section
        icon={Mail}
        title="Email"
        desc={
          p.emailVerified
            ? 'Email Anda sudah terverifikasi. Isi email baru untuk menggantinya.'
            : 'Email Anda belum diverifikasi. Kosongkan email baru untuk memverifikasi email saat ini.'
        }
        onSubmit={sendEmail}
        footer={
          <Button type="submit" disabled={sending || (!newEmail && p.emailVerified)}>
            {sending ? 'Mengirim...' : newEmail ? 'Kirim Konfirmasi' : 'Kirim Verifikasi'}
          </Button>
        }
      >
        <Notice msg={emailMsg} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Email Saat Ini</label>
            <input className={input} value={p.email} disabled />
          </div>
          <div>
            <label className={label}>Email Baru</label>
            <input
              className={input}
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email.baru@contoh.com"
            />
            <p className={hint}>Aktif setelah tautan di email baru dibuka.</p>
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Password Saat Ini</label>
            <input
              className={input}
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
        </div>
      </Section>

      <Section
        icon={KeyRound}
        title="Ubah Password"
        desc="Gunakan minimal 8 karakter yang sulit ditebak."
        onSubmit={savePassword}
        footer={
          <Button type="submit" disabled={savingPw || !currentPassword || !newPassword || !confirmPassword}>
            {savingPw ? 'Menyimpan...' : 'Simpan Password'}
          </Button>
        }
      >
        <Notice msg={pwMsg} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={label}>Password Saat Ini</label>
            <input
              className={input}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className={label}>Password Baru</label>
            <input
              className={input}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimal 8 karakter"
            />
          </div>
          <div>
            <label className={label}>Ulangi Password Baru</label>
            <input
              className={input}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password baru"
            />
          </div>
        </div>
      </Section>
    </div>
  );
}
