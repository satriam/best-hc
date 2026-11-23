import { createHash, randomBytes } from 'crypto';
import { sendMail } from '@/lib/mailer';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { createSessionToken, setSessionCookie, clearSessionCookie } from '@/lib/auth';
import { LoginInput } from '@/schemas/auth.schema';

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
  });

  if (!user || user.deletedAt) {
    throw new Error('Email atau password salah');
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.password);
  if (!isPasswordValid) {
    throw new Error('Email atau password salah');
  }

  const userPayload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const token = await createSessionToken(userPayload);
  await setSessionCookie(token);

  return userPayload;
}

export async function logoutUser() {
  await clearSessionCookie();
}

const RESET_TTL_MS = 60 * 60 * 1000;
const RESET_COOLDOWN_MS = 60 * 1000;
const MAX_PER_USER_PER_HOUR = 3;
const MAX_PER_IP_PER_HOUR = 10;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Melempar error bila email tidak terdaftar / sudah dihapus. */
export async function requestPasswordReset(email: string, origin: string, ip: string | null = null) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) throw new Error('Email tidak terdaftar');

  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000);

  const last = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  if (last && last.createdAt.getTime() > now - RESET_COOLDOWN_MS) {
    throw new Error('Tunggu 1 menit sebelum meminta tautan lagi');
  }

  const perUser = await prisma.passwordResetToken.count({
    where: { userId: user.id, createdAt: { gt: hourAgo } },
  });
  if (perUser >= MAX_PER_USER_PER_HOUR) {
    throw new Error('Terlalu banyak permintaan. Coba lagi dalam 1 jam.');
  }

  if (ip) {
    const perIp = await prisma.passwordResetToken.count({
      where: { ip, createdAt: { gt: hourAgo } },
    });
    if (perIp >= MAX_PER_IP_PER_HOUR) {
      throw new Error('Terlalu banyak permintaan. Coba lagi dalam 1 jam.');
    }
  }

  const token = randomBytes(32).toString('hex');
  // Matikan tautan lama; baris tetap disimpan agar bisa dihitung untuk rate limit.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.passwordResetToken.deleteMany({
    where: { createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } },
  });
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(now + RESET_TTL_MS),
      ip,
    },
  });

  const base = process.env.APP_URL || origin;
  const link = `${base}/reset-password?token=${token}`;
  await sendMail(
    user.email,
    'Reset Password Best HCM',
    resetEmailHtml(user.name, link),
    `Halo ${user.name},\n\nBuka tautan ini untuk reset password (berlaku 1 jam):\n${link}\n\nAbaikan email ini bila bukan Anda yang meminta.`
  );
}

function resetEmailHtml(name: string, link: string) {
  return `<!DOCTYPE html>
<html lang="id"><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
  <tr><td style="background:#4f46e5;padding:28px 32px;text-align:center;">
    <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:0.5px;">Best HCM</div>
    <div style="font-size:12px;color:#c7d2fe;margin-top:4px;">Human Capital Management</div>
  </td></tr>
  <tr><td style="padding:32px;">
    <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">Reset Password</h1>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#334155;">Halo <strong>${escapeHtml(name)}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#334155;">Kami menerima permintaan untuk mengatur ulang password akun Anda. Klik tombol di bawah untuk membuat password baru.</p>
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr>
      <td style="background:#4f46e5;border-radius:10px;">
        <a href="${link}" style="display:inline-block;padding:14px 32px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Atur Ulang Password</a>
      </td></tr></table>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;font-size:12px;line-height:1.5;color:#92400e;margin-bottom:24px;">
      Tautan berlaku <strong>1 jam</strong> dan hanya bisa dipakai sekali.
    </div>
    <p style="margin:0 0 6px;font-size:12px;color:#64748b;">Tombol tidak berfungsi? Salin tautan ini ke browser:</p>
    <p style="margin:0;font-size:12px;word-break:break-all;"><a href="${link}" style="color:#4f46e5;">${link}</a></p>
  </td></tr>
  <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;font-size:11px;line-height:1.5;color:#94a3b8;">
    Jika Anda tidak memintanya, abaikan email ini. Password Anda tidak akan berubah.<br/>&copy; Best HCM
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date() || record.user.deletedAt) {
    throw new Error('Tautan reset tidak valid atau sudah kedaluwarsa');
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { password: hashed } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: record.userId } }),
  ]);
}
