import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpError } from './errors.js';
import {
  MAX_PER_ENDPOINT,
  WatchStore,
  classify,
  expired,
  freeCourtList,
  transition,
  validateSubscription,
  type PushSub,
} from './watches.js';

/** Lưới 10 sân × 38 cột; `busy` là các ô [sân, cột] đã đặt. */
function grid(busy: [number, number][] = []): boolean[][] {
  const g = Array.from({ length: 10 }, () => Array<boolean>(38).fill(true));
  for (const [court, col] of busy) g[court - 1][col] = false;
  return g;
}

const sub = (n = 1): PushSub => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p', auth: 'a' } });

describe('freeCourtList', () => {
  it('liệt kê các sân trống trọn khung theo thứ tự tăng dần', () => {
    // 18:00–20:00 = cột 26..29
    const g = grid([[2, 27], [5, 26]]);
    expect(freeCourtList(g, '18:00', '20:00')).toEqual([1, 3, 4, 6, 7, 8, 9, 10]);
  });

  it('ô bận ngoài khung không ảnh hưởng', () => {
    expect(freeCourtList(grid([[1, 25]]), '18:00', '20:00')).toContain(1);
  });

  it('khung ngoài 05:00–24:00 hoặc ngược thì rỗng', () => {
    expect(freeCourtList(grid(), '04:30', '06:00')).toEqual([]);
    expect(freeCourtList(grid(), '23:00', '24:30')).toEqual([]);
    expect(freeCourtList(grid(), '08:00', '08:00')).toEqual([]);
  });

  it('khung đến sát 24:00 hợp lệ', () => {
    expect(freeCourtList(grid(), '23:00', '24:00')).toHaveLength(10);
  });
});

describe('classify / transition', () => {
  it('phân loại theo ngưỡng', () => {
    expect(classify(0, 2)).toBe('none');
    expect(classify(1, 2)).toBe('few');
    expect(classify(2, 2)).toBe('few');
    expect(classify(3, 2)).toBe('many');
  });

  it('lần đọc đầu chỉ ghi mốc, không báo', () => {
    expect(transition('unknown', 'few')).toBeNull();
    expect(transition('unknown', 'none')).toBeNull();
    expect(transition('unknown', 'many')).toBeNull();
  });

  it('báo khi xuống ngưỡng, hết sân và có sân lại', () => {
    expect(transition('many', 'few')).toBe('low');
    expect(transition('many', 'none')).toBe('soldout');
    expect(transition('few', 'none')).toBe('soldout');
    expect(transition('none', 'few')).toBe('back');
    expect(transition('none', 'many')).toBe('back');
  });

  it('không báo khi giữ nguyên hoặc chỉ nhiều lên', () => {
    expect(transition('few', 'few')).toBeNull();
    expect(transition('none', 'none')).toBeNull();
    expect(transition('few', 'many')).toBeNull();
  });
});

describe('expired', () => {
  it('tính theo giờ Việt Nam (UTC+7)', () => {
    const w = { date: '2026-11-22', start: '18:00' };
    expect(expired(w, Date.parse('2026-11-22T10:59:00Z'))).toBe(false); // 17:59 VN
    expect(expired(w, Date.parse('2026-11-22T11:00:00Z'))).toBe(true); // 18:00 VN
  });
});

describe('validateSubscription', () => {
  it('nhận đăng ký https hợp lệ', () => {
    expect(validateSubscription(sub())).toEqual(sub());
  });

  it('từ chối thiếu khoá, không phải https, hoặc không phải URL', () => {
    expect(() => validateSubscription(null)).toThrow(HttpError);
    expect(() => validateSubscription({ endpoint: 'https://x/y' })).toThrow(HttpError);
    expect(() => validateSubscription({ ...sub(), endpoint: 'http://push.example/1' })).toThrow(HttpError);
    expect(() => validateSubscription({ ...sub(), endpoint: 'khong-phai-url' })).toThrow(HttpError);
  });
});

describe('WatchStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'watches-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lưu xuống đĩa và đọc lại được', () => {
    const a = new WatchStore(dir);
    const w = a.add(sub(), '2026-11-22', '18:00', '20:00', 2);
    a.setState(w.id, 'many');
    const b = new WatchStore(dir);
    expect(b.all()).toHaveLength(1);
    expect(b.all()[0]).toMatchObject({ id: w.id, threshold: 2, state: 'many' });
  });

  it('cùng thiết bị + cùng khung chỉ đổi ngưỡng và đặt lại mốc', () => {
    const s = new WatchStore(dir);
    const w1 = s.add(sub(), '2026-11-22', '18:00', '20:00', 2);
    s.setState(w1.id, 'few');
    const w2 = s.add(sub(), '2026-11-22', '18:00', '20:00', 3);
    expect(w2.id).toBe(w1.id);
    expect(s.all()).toHaveLength(1);
    expect(w2).toMatchObject({ threshold: 3, state: 'unknown' });
  });

  it(`giới hạn ${MAX_PER_ENDPOINT} khung mỗi thiết bị`, () => {
    const s = new WatchStore(dir);
    for (let i = 0; i < MAX_PER_ENDPOINT; i++) s.add(sub(), '2026-11-22', `0${5 + i}:00`, `0${6 + i}:00`, 2);
    expect(() => s.add(sub(), '2026-11-22', '12:00', '13:00', 2)).toThrow(HttpError);
    expect(() => s.add(sub(2), '2026-11-22', '12:00', '13:00', 2)).not.toThrow();
  });

  it('chỉ xoá khi đúng cả id lẫn thiết bị', () => {
    const s = new WatchStore(dir);
    const w = s.add(sub(1), '2026-11-22', '18:00', '20:00', 2);
    expect(s.remove(w.id, sub(2).endpoint)).toBe(false);
    expect(s.list(sub(1).endpoint)).toHaveLength(1);
    expect(s.remove(w.id, sub(1).endpoint)).toBe(true);
    expect(s.all()).toHaveLength(0);
  });

  it('removeEndpoint bỏ mọi theo dõi của thiết bị đó', () => {
    const s = new WatchStore(dir);
    s.add(sub(1), '2026-11-22', '18:00', '20:00', 2);
    s.add(sub(1), '2026-11-23', '18:00', '20:00', 2);
    s.add(sub(2), '2026-11-22', '18:00', '20:00', 2);
    s.removeEndpoint(sub(1).endpoint);
    expect(s.all().map((w) => w.subscription.endpoint)).toEqual([sub(2).endpoint]);
  });

  it('seedState chỉ gán khi chưa có mốc, không ghi đè mốc của tick', () => {
    const s = new WatchStore(dir);
    const w = s.add(sub(), '2026-11-22', '18:00', '20:00', 2);
    s.seedState(w.id, 'many');
    expect(s.all()[0].state).toBe('many');
    s.setState(w.id, 'few');
    s.seedState(w.id, 'many');
    expect(s.all()[0].state).toBe('few');
  });

  it('purgeExpired xoá khung đã bắt đầu', () => {
    const s = new WatchStore(dir);
    s.add(sub(), '2026-11-22', '08:00', '09:00', 2);
    s.add(sub(), '2026-11-22', '18:00', '20:00', 2);
    const now = Date.parse('2026-11-22T05:00:00Z'); // 12:00 VN
    expect(s.purgeExpired(now)).toBe(1);
    expect(s.all().map((w) => w.start)).toEqual(['18:00']);
  });
});
