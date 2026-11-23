import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { sendMail } from '@/lib/mailer';
import { createSessionToken, getSession, setSessionCookie } from '@/lib/auth';

const TTL_MS = 60 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_PER_HOUR = 5;

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function refreshSession(user: { id: string; name: string; email: string; role: 'ADMIN' | 'USER' }) {
  const session = await getSession();
  if (session?.id === user.id) {
    await setSessionCookie(
      await createSessionToken({ id: user.id, name: user.name, email: user.email, role: user.role })
    );
  }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new Error('Pengguna tidak ditemukan');
  if (!(await bcrypt.compare(currentPassword, user.password))) throw new Error('Password saat ini salah');

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { password: hashed } }),
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
  ]);
}

/** Kirim link verifikasi ke email saat ini, atau ke `newEmail` untuk ganti email. */
export async function requestEmailVerification(
  userId: string,
  password: string,
  newEmail: string | undefined,
  origin: string
) {
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) throw new Error('Pengguna tidak ditemukan');
  if (!(await bcrypt.compare(password, user.password))) throw new Error('Password salah');

  const target = (newEmail ?? user.email).toLowerCase();
  const isChange = target !== user.email.toLowerCase();

  if (!isChange && user.emailVerifiedAt) throw new Error('Email sudah terverifikasi');
  if (isChange) {
    const taken = await prisma.user.findFirst({ where: { email: target } });
    if (taken) throw new Error('Email sudah dipakai pengguna lain');
  }

  const now = Date.now();
  const recent = await prisma.emailVerificationToken.findMany({
    where: { userId, createdAt: { gt: new Date(now - TTL_MS) } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent[0] && recent[0].createdAt.getTime() > now - COOLDOWN_MS) {
    throw new Error('Tunggu 1 menit sebelum meminta tautan lagi');
  }
  if (recent.length >= MAX_PER_HOUR) throw new Error('Terlalu banyak permintaan. Coba lagi dalam 1 jam.');

  const token = randomBytes(32).toString('hex');
  await prisma.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.emailVerificationToken.deleteMany({
    where: { createdAt: { lt: new Date(now - 24 * TTL_MS) } },
  });
  await prisma.emailVerificationToken.create({
    data: { userId, email: target, tokenHash: hashToken(token), expiresAt: new Date(now + TTL_MS) },
  });

  const link = `${process.env.APP_URL || origin}/verify-email?token=${token}`;
  const title = isChange ? 'Konfirmasi Email Baru' : 'Verifikasi Email';
  const intro = isChange
    ? `Anda meminta mengganti email akun Best HCM menjadi <strong>${esc(target)}</strong>. Klik tombol di bawah untuk mengonfirmasi.`
    : 'Klik tombol di bawah untuk memverifikasi alamat email akun Best HCM Anda.';
  await sendMail(
    target,
    `${title} Best HCM`,
    verifyEmailHtml(title, user.name, intro, link),
    `Halo ${user.name},\n\n${title}: buka tautan ini (berlaku 1 jam):\n${link}\n\nAbaikan email ini bila bukan Anda yang meminta.`
  );
  return { email: target, isChange };
}

export async function confirmEmailVerification(token: string) {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.user.deletedAt) {
    throw new Error('Tautan tidak valid atau sudah kedaluwarsa');
  }
  if (record.email.toLowerCase() !== record.user.email.toLowerCase()) {
    const taken = await prisma.user.findFirst({
      where: { email: record.email, NOT: { id: record.userId } },
    });
    if (taken) throw new Error('Email sudah dipakai pengguna lain');
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { email: record.email, emailVerifiedAt: new Date() },
    }),
    prisma.emailVerificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await refreshSession(user);
  return { email: user.email };
}

function verifyEmailHtml(title: string, name: string, intro: string, link: string) {
  return `<!DOCTYPE html>
<html lang="id"><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
  <tr><td style="background:#4f46e5;padding:28px 32px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#ffffff;">Best HCM</div>
    <div style="font-size:12px;color:#c7d2fe;margin-top:4px;">Human Capital Management</div>
  </td></tr>
  <tr><td style="padding:32px;">
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">${esc(title)}</h1>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#334155;">Halo <strong>${esc(name)}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#334155;">${intro}</p>
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="background:#4f46e5;border-radius:10px;">
      <a href="${link}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(title)}</a>
    </td></tr></table>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:12px;color:#92400e;margin-bottom:24px;">Tautan berlaku <strong>1 jam</strong> dan hanya bisa dipakai sekali.</div>
    <p style="margin:0 0 6px;font-size:12px;color:#64748b;">Tombol tidak berfungsi? Salin tautan ini:</p>
    <p style="margin:0;font-size:12px;word-break:break-all;"><a href="${link}" style="color:#4f46e5;">${link}</a></p>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;font-size:11px;color:#94a3b8;">Jika Anda tidak memintanya, abaikan email ini.<br/>&copy; Best HCM</td></tr>
</table></td></tr></table></body></html>`;
}
