import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpError } from './errors.js';

/** Cột đầu của lưới ứng với 05:00, mỗi cột 30 phút (trùng `GRID` ở alobo/layout.ts). */
const FIRST_MINUTE = 300;
const LAST_MINUTE = 1440;
const COURTS = 10;

export const MAX_PER_ENDPOINT = 5;
export const MAX_TOTAL = 200;

/** Đăng ký Web Push của một thiết bị (PushSubscription.toJSON()). */
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** `many`: còn nhiều hơn ngưỡng; `few`: còn 1..ngưỡng sân; `none`: hết sân; `unknown`: chưa đọc lần nào. */
export type WatchState = 'unknown' | 'many' | 'few' | 'none';
export type WatchEvent = 'low' | 'soldout' | 'back';

export interface Watch {
  id: string;
  subscription: PushSub;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  /** Báo khi số sân trống trọn khung giảm xuống ≤ ngưỡng. */
  threshold: number;
  state: WatchState;
  createdAt: number;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Các sân (tăng dần) trống trọn khung [start, end); rỗng nếu khung nằm ngoài 05:00–24:00. */
export function freeCourtList(free: boolean[][], start: string, end: string): number[] {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s < FIRST_MINUTE || e > LAST_MINUTE || s >= e) return [];
  const cols: number[] = [];
  for (let m = s; m < e; m += 30) cols.push((m - FIRST_MINUTE) / 30);
  const out: number[] = [];
  for (let c = 1; c <= COURTS; c++) if (cols.every((col) => free[c - 1]?.[col] === true)) out.push(c);
  return out;
}

export function classify(count: number, threshold: number): Exclude<WatchState, 'unknown'> {
  if (count === 0) return 'none';
  return count <= threshold ? 'few' : 'many';
}

/** Sự kiện cần báo khi trạng thái đổi từ `prev` sang `next`; null nếu không báo. Lần đọc đầu chỉ ghi mốc. */
export function transition(prev: WatchState, next: Exclude<WatchState, 'unknown'>): WatchEvent | null {
  if (prev === 'unknown' || prev === next) return null;
  if (next === 'none') return 'soldout';
  if (prev === 'none') return 'back';
  if (prev === 'many' && next === 'few') return 'low';
  return null;
}

/** Khung đã bắt đầu (giờ Việt Nam, UTC+7 không đổi theo mùa) thì không còn cần theo dõi. */
export function expired(w: Pick<Watch, 'date' | 'start'>, now: number): boolean {
  return Date.parse(`${w.date}T${w.start}:00+07:00`) <= now;
}

const isSub = (v: unknown): v is PushSub => {
  if (!v || typeof v !== 'object') return false;
  const s = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  return (
    typeof s.endpoint === 'string' &&
    typeof s.keys?.p256dh === 'string' &&
    typeof s.keys.auth === 'string'
  );
};

/** Đăng ký phải là URL https và không quá dài; chặn máy chủ bị lợi dụng gọi tới địa chỉ tuỳ ý. */
export function validateSubscription(raw: unknown): PushSub {
  if (!isSub(raw) || raw.endpoint.length > 1000 || raw.keys.p256dh.length > 200 || raw.keys.auth.length > 100) {
    throw new HttpError('Đăng ký thông báo không hợp lệ', 400);
  }
  let url: URL;
  try {
    url = new URL(raw.endpoint);
  } catch {
    throw new HttpError('Đăng ký thông báo không hợp lệ', 400);
  }
  if (url.protocol !== 'https:') throw new HttpError('Đăng ký thông báo không hợp lệ', 400);
  return { endpoint: raw.endpoint, keys: { p256dh: raw.keys.p256dh, auth: raw.keys.auth } };
}

/** Danh sách theo dõi lưu ở `<dir>/watches.json` (ghi nguyên tử, chỉ chủ đọc được vì endpoint là địa chỉ riêng của thiết bị). */
export class WatchStore {
  private watches: Watch[] = [];
  private file: string;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = join(dir, 'watches.json');
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      if (Array.isArray(raw)) {
        this.watches = raw.filter((w): w is Watch => !!w && typeof w.id === 'string' && isSub(w.subscription));
      }
    } catch {
      // chưa có file hoặc hỏng: bắt đầu rỗng
    }
  }

  private save(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.watches), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, this.file);
  }

  all(): Watch[] {
    return [...this.watches];
  }

  list(endpoint: string): Watch[] {
    return this.watches.filter((w) => w.subscription.endpoint === endpoint);
  }

  /** Cùng thiết bị + cùng khung thì chỉ đổi ngưỡng (và đặt lại mốc), không tạo bản thứ hai. */
  add(sub: PushSub, date: string, start: string, end: string, threshold: number): Watch {
    const same = this.watches.find(
      (w) => w.subscription.endpoint === sub.endpoint && w.date === date && w.start === start && w.end === end,
    );
    if (same) {
      same.threshold = threshold;
      same.subscription = sub;
      same.state = 'unknown';
      this.save();
      return same;
    }
    if (this.list(sub.endpoint).length >= MAX_PER_ENDPOINT) {
      throw new HttpError(`Mỗi thiết bị theo dõi tối đa ${MAX_PER_ENDPOINT} khung giờ`, 429);
    }
    if (this.watches.length >= MAX_TOTAL) throw new HttpError('Máy chủ đang theo dõi quá nhiều khung giờ', 429);
    const w: Watch = { id: randomUUID(), subscription: sub, date, start, end, threshold, state: 'unknown', createdAt: Date.now() };
    this.watches.push(w);
    this.save();
    return w;
  }

  /** Chỉ xoá khi đúng cả id lẫn thiết bị; trả về có xoá hay không. */
  remove(id: string, endpoint: string): boolean {
    const n = this.watches.length;
    this.watches = this.watches.filter((w) => !(w.id === id && w.subscription.endpoint === endpoint));
    if (this.watches.length === n) return false;
    this.save();
    return true;
  }

  /** Thiết bị đã huỷ đăng ký (push service trả 404/410): bỏ mọi theo dõi của nó. */
  removeEndpoint(endpoint: string): void {
    const n = this.watches.length;
    this.watches = this.watches.filter((w) => w.subscription.endpoint !== endpoint);
    if (this.watches.length !== n) this.save();
  }

  setState(id: string, state: WatchState): void {
    const w = this.watches.find((x) => x.id === id);
    if (!w || w.state === state) return;
    w.state = state;
    this.save();
  }

  /** Gán mốc ban đầu lúc tạo, chỉ khi chưa có lần đọc nào (tick có thể đã ghi trước đó). */
  seedState(id: string, state: Exclude<WatchState, 'unknown'>): void {
    const w = this.watches.find((x) => x.id === id);
    if (w?.state === 'unknown') this.setState(id, state);
  }

  /** Xoá các theo dõi đã tới giờ bắt đầu; trả về số đã xoá. */
  purgeExpired(now: number): number {
    const n = this.watches.length;
    this.watches = this.watches.filter((w) => !expired(w, now));
    if (this.watches.length !== n) this.save();
    return n - this.watches.length;
  }
}
