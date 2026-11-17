import { describe, expect, it } from 'vitest';
import { parseWatchLink } from './booking';

const TODAY = '2026-11-20';

describe('parseWatchLink', () => {
  it('đọc khung giờ từ link thông báo', () => {
    expect(parseWatchLink('?dat-san&dat=2026-11-22&tu=18%3A00&den=20%3A00', TODAY)).toEqual({
      date: '2026-11-22',
      start: '18:00',
      end: '20:00',
    });
  });

  it('nhận cả dấu : không mã hoá', () => {
    expect(parseWatchLink('?dat-san&dat=2026-11-20&tu=08:30&den=10:00', TODAY)).toEqual({
      date: '2026-11-20',
      start: '08:30',
      end: '10:00',
    });
  });

  it('không có tham số thì null', () => {
    expect(parseWatchLink('?dat-san', TODAY)).toBeNull();
    expect(parseWatchLink('', TODAY)).toBeNull();
  });

  it('từ chối ngày đã qua hoặc sai định dạng', () => {
    expect(parseWatchLink('?dat=2026-11-19&tu=18:00&den=20:00', TODAY)).toBeNull();
    expect(parseWatchLink('?dat=22/11/2026&tu=18:00&den=20:00', TODAY)).toBeNull();
  });

  it('từ chối giờ lẻ, ngoài 05:00–24:00 hoặc ngược', () => {
    expect(parseWatchLink('?dat=2026-11-22&tu=18:15&den=20:00', TODAY)).toBeNull();
    expect(parseWatchLink('?dat=2026-11-22&tu=04:30&den=06:00', TODAY)).toBeNull();
    expect(parseWatchLink('?dat=2026-11-22&tu=23:00&den=24:30', TODAY)).toBeNull();
    expect(parseWatchLink('?dat=2026-11-22&tu=20:00&den=18:00', TODAY)).toBeNull();
  });

  it('từ chối khung cắt ngang ca 18:00–20:00', () => {
    expect(parseWatchLink('?dat=2026-11-22&tu=18:00&den=19:00', TODAY)).toBeNull();
  });

  it('khung sát 24:00 hợp lệ', () => {
    expect(parseWatchLink('?dat=2026-11-22&tu=23:00&den=24:00', TODAY)).toEqual({ date: '2026-11-22', start: '23:00', end: '24:00' });
  });
});
