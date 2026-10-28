import { describe, expect, it } from 'vitest';
import { pickerTarget, slotColumns } from './layout.js';

describe('pickerTarget', () => {
  it('cùng tháng', () => {
    expect(pickerTarget('2026-10-28', '2026-10-30')).toEqual({ monthsAhead: 0, x: 895, y: 594 });
  });
  it('tháng sau, ô đầu tuần', () => {
    expect(pickerTarget('2026-10-28', '2026-11-30')).toEqual({ monthsAhead: 1, x: 715, y: 636 });
  });
  it('qua năm', () => {
    expect(pickerTarget('2026-12-31', '2027-01-01').monthsAhead).toBe(1);
  });
});

describe('slotColumns', () => {
  it('khung giờ', () => {
    expect(slotColumns('22:00', '23:00')).toEqual([34, 35]);
    expect(slotColumns('05:00', '05:30')).toEqual([0]);
    expect(slotColumns('23:30', '24:00')).toEqual([37]);
  });
});
