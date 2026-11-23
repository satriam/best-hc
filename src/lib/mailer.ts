import nodemailer from 'nodemailer';

/**
 * SMTP Google. Env: SMTP_USER (alamat Gmail), SMTP_PASS (App Password 16 karakter,
 * butuh 2-Step Verification), opsional SMTP_HOST/SMTP_PORT/SMTP_FROM.
 */
export async function sendMail(to: string, subject: string, html: string, text: string) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('SMTP belum dikonfigurasi (SMTP_USER / SMTP_PASS)');

  const port = Number(process.env.SMTP_PORT || 465);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `Best HCM <${user}>`,
    to,
    subject,
    html,
    text,
  });
}
