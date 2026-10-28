import { describe, expect, it } from 'vitest';
import { parsePayment, parseTransferNote } from './flow.js';

describe('parseTransferNote', () => {
  it('đọc nội dung chuyển khoản kèm mã', () => {
    expect(parseTransferNote(['Mã đơn', 'ABC', 'Nội dung: Thanh toan online lich dat 4798'])).toBe('Thanh toan online lich dat 4798');
  });
  it('nội dung nằm trong một khối chữ nhiều dòng', () => {
    expect(parseTransferNote(['Vui lòng chuyển khoản\nThanh toan online lich dat 12\nrồi tải ảnh'])).toBe('Thanh toan online lich dat 12');
  });
  it('có dấu tiếng Việt vẫn khớp và trả về dạng không dấu', () => {
    expect(parseTransferNote(['Thanh toán online lịch đặt 4798'])).toBe('Thanh toan online lich dat 4798');
  });
  it('không có dòng này thì null', () => {
    expect(parseTransferNote(['Mã đơn', '4798', 'Hình ảnh thanh toán'])).toBeNull();
  });
});

describe('parsePayment', () => {
  it('trả kèm nội dung chuyển khoản; qr do confirm() điền sau', () => {
    const p = parsePayment(['Hình ảnh thanh toán', 'Mã đơn', 'X1', 'chuyển khoản 160.000 ₫', '04:53', 'Thanh toan online lich dat 4798']);
    expect(p).toEqual({ orderId: 'X1', amount: 160000, holdSeconds: 293, qr: null, note: 'Thanh toan online lich dat 4798' });
  });
});
