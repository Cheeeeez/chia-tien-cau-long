import { HttpError } from '../errors.js';
import type { BookingIntent } from '../intent.js';

export interface Summary {
  date: string; // YYYY-MM-DD
  court: string;
  start: string;
  end: string;
  total: number;
}

const fail = () => new HttpError('Không đọc được tóm tắt từ Alobo', 502);
const DATE_RE = /^Ngày: (\d{2})\/(\d{2})\/(\d{4})$/;
// Alobo dùng NBSP trước "₫" nên khớp bằng \s, không dùng dấu cách thường. Giờ sáng không có số 0 đầu ("6h00").
const LINE_RE = /^- (.+): (\d{1,2})h(\d{2}) - (\d{1,2})h(\d{2}) \| ([\d.]+)\s₫$/;

const hhmm = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`;

export function parseSummary(texts: string[]): Summary {
  let date: string | null = null;
  for (const t of texts) {
    const m = DATE_RE.exec(t);
    if (m) {
      date = `${m[3]}-${m[2]}-${m[1]}`;
      break;
    }
  }
  const lines = texts
    .map((t) => LINE_RE.exec(t))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({
      court: m[1],
      start: hhmm(m[2], m[3]),
      end: Number(m[4]) === 0 && m[5] === '00' ? '24:00' : hhmm(m[4], m[5]),
      price: Number(m[6].replace(/\./g, '')),
    }));
  // Khách có dòng "Số tiền cần thanh toán"; trang của tài khoản đã đăng nhập không có nên cộng giá các dòng.
  const totalM = /Số tiền cần thanh toán\s+([\d.]+)\s₫/.exec(texts.join('\n'));
  if (!date || lines.length === 0) throw fail();

  // Alobo tách một lượt đặt thành nhiều dòng theo khung giá: phải cùng sân và nối liền nhau.
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].court !== lines[0].court || lines[i].start !== lines[i - 1].end) throw fail();
  }
  return {
    date,
    court: lines[0].court,
    start: lines[0].start,
    end: lines[lines.length - 1].end,
    total: totalM ? Number(totalM[1].replace(/\./g, '')) : lines.reduce((sum, l) => sum + l.price, 0),
  };
}

const dmy = (d: string) => d.split('-').reverse().join('/');

/** Mô tả trường đầu tiên lệch so với yêu cầu, `null` nếu khớp. */
export function diffSummary(s: Summary, intent: BookingIntent, courtLabel: string): string | null {
  if (s.date !== intent.date) return `ngày (${dmy(s.date)})`;
  if (s.court !== courtLabel) return `sân (${s.court})`;
  if (s.start !== intent.start || s.end !== intent.end) return `giờ (${s.start}–${s.end})`;
  return null;
}
