import { describe, expect, it } from 'vitest';
import { parsePayment } from './flow.js';

describe('parsePayment', () => {
  it('đọc mã đơn (kèm #), số tiền, thời gian giữ chỗ; qr do confirm() điền sau', () => {
    const p = parsePayment(['Hình ảnh thanh toán', 'Mã đơn', '#5776', 'chuyển khoản 160.000 ₫', '04:53']);
    expect(p).toEqual({ orderId: '#5776', amount: 160000, holdSeconds: 293, qr: null });
  });
  it('không phải màn thanh toán thì null', () => {
    expect(parsePayment(['Mã đơn', '#5776'])).toBeNull();
  });
});
