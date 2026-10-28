import { HttpError } from './errors.js';

export interface BookingIntent {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  court: number | null;
}

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

/** Ngày hiện tại (YYYY-MM-DD) theo giờ Việt Nam. */
export function vnToday(now = new Date()): string {
  return fmt.format(now);
}

const bad = (msg: string) => new HttpError(msg, 400);

function minutes(hhmm: unknown, label: string): number {
  const m = typeof hhmm === 'string' ? /^(\d{2}):(\d{2})$/.exec(hhmm) : null;
  if (!m) throw bad(`Giờ ${label} không hợp lệ`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min !== 0 && min !== 30) throw bad(`Giờ ${label} phải tròn giờ hoặc rưỡi`);
  if (h > 24 || (h === 24 && min !== 0)) throw bad(`Giờ ${label} không hợp lệ`);
  return h * 60 + min;
}

export function validateIntent(raw: unknown, today: string): BookingIntent {
  if (!raw || typeof raw !== 'object') throw bad('Yêu cầu đặt sân không hợp lệ');
  const r = raw as Record<string, unknown>;

  const dm = typeof r.date === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date) : null;
  if (!dm) throw bad('Ngày không hợp lệ');
  const d = new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3]));
  if (d.getUTCFullYear() !== +dm[1] || d.getUTCMonth() !== +dm[2] - 1 || d.getUTCDate() !== +dm[3]) {
    throw bad('Ngày không hợp lệ');
  }
  if ((r.date as string) < today) throw bad('Ngày đã qua');

  const s = minutes(r.start, 'bắt đầu');
  const e = minutes(r.end, 'kết thúc');
  if (s < 300 || s >= e || e > 1440) throw bad('Khung giờ phải nằm trong 05:00–24:00 và giờ bắt đầu trước giờ kết thúc');

  const court = r.court ?? null;
  if (court !== null && !(typeof court === 'number' && Number.isInteger(court) && court >= 1 && court <= 10)) {
    throw bad('Sân phải từ 1 đến 10');
  }
  return { date: r.date as string, start: r.start as string, end: r.end as string, court };
}

/** Về dạng 9 chữ số không có số 0 đầu (Alobo tự thêm). */
export function normalizePhone(input: string): string {
  let p = input.replace(/[\s.\-]/g, '');
  if (p.startsWith('+84')) p = p.slice(3);
  else if (p.startsWith('84') && p.length === 11) p = p.slice(2);
  else if (p.startsWith('0')) p = p.slice(1);
  if (!/^[35789]\d{8}$/.test(p)) throw bad('Số điện thoại không hợp lệ');
  return p;
}

export function validateName(input: unknown): string {
  const n = typeof input === 'string' ? input.trim() : '';
  if (n.length < 1 || n.length > 50) throw bad('Tên không hợp lệ');
  return n;
}
