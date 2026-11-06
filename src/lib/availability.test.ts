import { describe, expect, it } from 'vitest';
import { freeCourts, nearbySlots } from './availability';

const COLS = 38;
/** Lưới 10 sân × 38 cột: mặc định trống; `busy` là danh sách [sân, từ HH:MM, đến HH:MM) đã đặt. */
function grid(busy: [court: number, from: string, to: string][] = []): boolean[][] {
  const g = Array.from({ length: 10 }, () => Array<boolean>(COLS).fill(true));
  const col = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h * 60 + m - 300) / 30;
  };
  for (const [c, from, to] of busy) for (let i = col(from); i < col(to); i++) g[c - 1][i] = false;
  return g;
}

describe('freeCourts', () => {
  it('tất cả trống thì theo thứ tự ưu tiên 4–9, 3, 2, 1, 10', () => {
    expect(freeCourts(grid(), '18:00', '20:00')).toEqual([4, 5, 6, 7, 8, 9, 3, 2, 1, 10]);
  });
  it('bỏ sân bị đặt dù chỉ một cột trong khung', () => {
    const g = grid([[4, '19:30', '20:00'], [6, '18:00', '18:30']]);
    expect(freeCourts(g, '18:00', '20:00')).toEqual([5, 7, 8, 9, 3, 2, 1, 10]);
  });
  it('đặt ngoài khung không ảnh hưởng', () => {
    expect(freeCourts(grid([[4, '20:00', '22:00']]), '18:00', '20:00')).toContain(4);
  });
  it('khung kết thúc 24:00 đọc được cột cuối', () => {
    expect(freeCourts(grid([[4, '23:30', '24:00']]), '23:00', '24:00')).not.toContain(4);
    expect(freeCourts(grid(), '23:00', '24:00')).toHaveLength(10);
  });
  it('khung ngoài 05:00–24:00 hoặc rỗng thì không có sân', () => {
    expect(freeCourts(grid(), '04:30', '06:00')).toEqual([]);
    expect(freeCourts(grid(), '20:00', '20:00')).toEqual([]);
  });
});

describe('nearbySlots', () => {
  const full = (from: string, to: string) =>
    Array.from({ length: 10 }, (_, i) => [i + 1, from, to] as [number, string, string]);

  it('ca 18–20 kín: mọi khung lệch ≤90 cắt ngang ca nên gợi ý 16–18 và 20–22', () => {
    const slots = nearbySlots(grid(full('18:00', '20:00')), '18:00', '20:00');
    expect(slots.map((s) => [s.start, s.end])).toEqual([
      ['16:00', '18:00'],
      ['20:00', '22:00'],
    ]);
  });

  it('gợi ý khung lệch gần nhất trước, kèm các sân trống theo thứ tự ưu tiên', () => {
    const g = grid(full('08:00', '09:00'));
    const slots = nearbySlots(g, '08:00', '09:00');
    // 07:30 và 08:30 chồng lên khung đang kín nên không có sân; gần nhất còn trống là 07:00, 09:00, 06:30
    expect(slots.map((s) => s.start)).toEqual(['07:00', '09:00', '06:30']);
    expect(slots[0].courts).toEqual([4, 5, 6, 7, 8, 9, 3, 2, 1, 10]);
  });

  it('tối đa 3 khung', () => {
    expect(nearbySlots(grid(full('12:00', '13:00')), '12:00', '13:00')).toHaveLength(3);
  });

  it('không vượt 05:00 và 24:00', () => {
    const early = nearbySlots(grid(full('05:00', '06:00')), '05:00', '06:00');
    expect(early.every((s) => s.start >= '05:00')).toBe(true);
    const late = nearbySlots(grid(full('23:00', '24:00')), '23:00', '24:00');
    expect(late.every((s) => s.end <= '24:00')).toBe(true);
  });

  it('bỏ khung cắt ngang ca 18–20', () => {
    // khung 17:00–18:00 kín: −30 chồng khung kín; +30/+60/+90 (17:30–…, 18:00–19:00, 18:30–19:30) cắt ca nên bị bỏ
    const slots = nearbySlots(grid(full('17:00', '18:00')), '17:00', '18:00');
    expect(slots.map((s) => s.start)).toEqual(['16:00', '15:30', '15:00']);
  });

  it('hết sân mọi khung gần thì rỗng', () => {
    const g = grid(full('05:00', '24:00'));
    expect(nearbySlots(g, '18:00', '20:00')).toEqual([]);
  });
});
