/**
 * Notifikasi Telegram ke channel saat ada pengajuan cuti/SPKL baru.
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (ID channel, mis. "-1001234567890").
 * Tidak pernah melempar error: kegagalan kirim tidak boleh menggagalkan aksi utama.
 */
interface SendOptions {
  /** Teks tombol + URL tujuan (inline keyboard, 1 baris 1 tombol). */
  buttonText?: string;
  buttonUrl?: string;
}

/** Mengembalikan message_id pesan yang terkirim, atau null bila gagal/tidak terkonfigurasi. */
export async function sendTelegramMessage(text: string, options: SendOptions = {}): Promise<number | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum dikonfigurasi, notifikasi dilewati');
    return null;
  }

  const reply_markup =
    options.buttonText && options.buttonUrl
      ? { inline_keyboard: [[{ text: options.buttonText, url: options.buttonUrl }]] }
      : undefined;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup,
      }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      console.error('[telegram] gagal mengirim pesan:', res.status, json);
      return null;
    }
    return json.result?.message_id ?? null;
  } catch (error) {
    console.error('[telegram] error mengirim pesan:', error);
    return null;
  }
}

/** Hapus pesan notifikasi di channel, misalnya saat pengajuan dibatalkan. Tidak pernah melempar error. */
export async function deleteTelegramMessage(messageId: number): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[telegram] gagal menghapus pesan:', res.status, body);
    }
  } catch (error) {
    console.error('[telegram] error menghapus pesan:', error);
  }
}

/** URL dasar aplikasi untuk tombol "Buka di Web" (tanpa slash akhir). */
function appBaseUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3005').replace(/\/+$/, '');
}

/** Telegram menolak tombol inline yang mengarah ke localhost/IP privat. */
function isPublicHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname;
    return host !== 'localhost' && !/^127\.|^0\.0\.0\.0$|^192\.168\.|^10\./.test(host);
  } catch {
    return false;
  }
}

/** Tombol "Buka di Web", dilewati otomatis bila APP_URL belum berupa domain publik (mis. localhost saat development). */
function webButton(path: string): SendOptions {
  const url = `${appBaseUrl()}${path}`;
  return isPublicHttpUrl(url) ? { buttonText: '🌐 Buka di Web', buttonUrl: url } : {};
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  NON_SHIFT: 'Non-Shift',
  SHIFT: 'Shift',
};

export async function notifyLeaveCreated(params: {
  requestId: string;
  employeeName: string;
  nip?: string | null;
  position?: string | null;
  workUnit?: string | null;
  leaveTypeNames: string[];
  startDate: string;
  endDate: string;
  totalDays: number;
  reason?: string | null;
  submittedAt: string;
}): Promise<number | null> {
  const {
    requestId,
    employeeName,
    nip,
    position,
    workUnit,
    leaveTypeNames,
    startDate,
    endDate,
    totalDays,
    reason,
    submittedAt,
  } = params;

  const lines = [
    '🟡 <b>PENGAJUAN CUTI BARU</b>',
    '━━━━━━━━━━━━━━━━━━',
    `👤 <b>${escapeHtml(employeeName)}</b>`,
  ];
  if (nip) lines.push(`🆔 NIP: ${escapeHtml(nip)}`);
  if (position || workUnit) {
    lines.push(`🏢 ${escapeHtml([position, workUnit].filter(Boolean).join(' · '))}`);
  }
  lines.push(
    '',
    `📋 Jenis Cuti: <b>${escapeHtml(leaveTypeNames.join(', ') || '-')}</b>`,
    `🗓 Tanggal: <b>${escapeHtml(startDate)} – ${escapeHtml(endDate)}</b>`,
    `📆 Durasi: <b>${totalDays} hari</b>`
  );
  if (reason) lines.push(`📝 Keterangan: ${escapeHtml(reason)}`);
  lines.push('', `🕒 Diajukan: ${escapeHtml(submittedAt)}`);

  return sendTelegramMessage(lines.join('\n'), webButton(`/admin/leave-requests/${requestId}`));
}

export async function notifySpklCreated(params: {
  spklId: string;
  employeeName: string;
  nip?: string | null;
  position?: string | null;
  number: string;
  type: string;
  workUnit?: string | null;
  totalHours: number;
  itemCount: number;
  submittedAt: string;
}): Promise<number | null> {
  const {
    spklId,
    employeeName,
    nip,
    position,
    number,
    type,
    workUnit,
    totalHours,
    itemCount,
    submittedAt,
  } = params;

  const lines = [
    '🟢 <b>PENGAJUAN SPKL BARU</b>',
    '━━━━━━━━━━━━━━━━━━',
    `👤 <b>${escapeHtml(employeeName)}</b>`,
  ];
  if (nip) lines.push(`🆔 NIP: ${escapeHtml(nip)}`);
  if (position || workUnit) {
    lines.push(`🏢 ${escapeHtml([position, workUnit].filter(Boolean).join(' · '))}`);
  }
  lines.push(
    '',
    `📄 Nomor: <b>${escapeHtml(number)}</b>`,
    `⚙️ Tipe: <b>${escapeHtml(LEAVE_TYPE_LABEL[type] ?? type)}</b>`,
    `👥 Jumlah Pekerja: <b>${itemCount} orang</b>`,
    `⏱ Total Jam: <b>${totalHours} jam</b>`,
    '',
    `🕒 Diajukan: ${escapeHtml(submittedAt)}`
  );

  return sendTelegramMessage(lines.join('\n'), webButton(`/spkl/${spklId}`));
}
