import { describe, expect, it } from 'vitest';
import { diffSummary, parseSummary } from './summary.js';

const texts = [
  'Ngày: 30/10/2026',
  'Đăng nhập để có thể sử dụng ưu đãi\nSố tiền cần thanh toán\n80.000\u00a0₫',
  '- C.Lông 10: 22h00 - 23h00 | 80.000\u00a0₫',
];

describe('parseSummary', () => {
  it('đọc tóm tắt thật', () => {
    expect(parseSummary(texts)).toEqual({ date: '2026-10-30', court: 'C.Lông 10', start: '22:00', end: '23:00', total: 80000 });
  });
  it('00h00 là 24:00', () => {
    const t = [texts[0], texts[1], '- C.Lông 1: 23h00 - 00h00 | 40.000\u00a0₫'];
    expect(parseSummary(t).end).toBe('24:00');
  });
  it('giờ sáng không có số 0 đầu', () => {
    const t = [texts[0], texts[1], '- C.Lông 1: 6h00 - 8h00 | 160.000\u00a0₫'];
    expect(parseSummary(t)).toMatchObject({ court: 'C.Lông 1', start: '06:00', end: '08:00' });
  });
  it('trang tài khoản không có dòng "Số tiền cần thanh toán": cộng giá các dòng', () => {
    const t = [
      'Ngày: 29/10/2026',
      '- C.Lông 1: 6h00 - 7h00 | 40.000\u00a0₫',
      '- C.Lông 1: 7h00 - 8h00 | 50.000\u00a0₫',
    ];
    expect(parseSummary(t)).toMatchObject({ start: '06:00', end: '08:00', total: 90000 });
  });
  it('thiếu dòng sân thì lỗi', () => {
    expect(() => parseSummary(texts.slice(0, 2))).toThrow();
  });
  it('gộp các dòng theo khung giá thành một khoảng liền', () => {
    const t = [
      texts[0],
      'Số tiền cần thanh toán\n440.000\u00a0₫',
      '- C.Lông 2: 19h00 - 22h00 | 360.000\u00a0₫',
      '- C.Lông 2: 22h00 - 23h00 | 80.000\u00a0₫',
    ];
    expect(parseSummary(t)).toEqual({ date: '2026-10-30', court: 'C.Lông 2', start: '19:00', end: '23:00', total: 440000 });
  });
  it('dòng khác sân hoặc không liền nhau thì lỗi', () => {
    expect(() => parseSummary([...texts, '- C.Lông 2: 23h00 - 00h00 | 80.000\u00a0₫'])).toThrow();
    expect(() => parseSummary([...texts, '- C.Lông 10: 23h30 - 00h00 | 40.000\u00a0₫'])).toThrow();
  });
});

describe('diffSummary', () => {
  const s = parseSummary(texts);
  const intent = { date: '2026-10-30', start: '22:00', end: '23:00', court: 10 };
  it('khớp', () => expect(diffSummary(s, intent, 'C.Lông 10')).toBeNull());
  it('lệch sân', () => expect(diffSummary(s, intent, 'C.Lông 3')).toContain('sân'));
  it('lệch giờ', () => expect(diffSummary(s, { ...intent, end: '23:30' }, 'C.Lông 10')).toContain('giờ'));
});
