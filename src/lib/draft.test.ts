import { describe, expect, it } from 'vitest';
import { addCourtFee, newBoard } from './draft';
import type { SavedDraft } from './types';

const fee = { amount: 240000, date: '2026-11-05', payerId: 'A' };

describe('addCourtFee', () => {
  it('chưa có bảng: tạo bảng mới với Tiền sân đã điền và Tiền cầu mặc định', () => {
    const r = addCourtFee(null, fee);
    expect(r.shared).toBe(false);
    expect(r.session).not.toBe('');
    expect(r.draft.date).toBe(fee.date);
    expect(r.draft.expenses.map(({ label, qty, unitPrice, payerId }) => ({ label, qty, unitPrice, payerId }))).toEqual([
      { label: 'Tiền sân', qty: 1, unitPrice: 240000, payerId: 'A' },
      { label: 'Tiền cầu', qty: 1, unitPrice: 30000, payerId: '' },
    ]);
  });

  it('bảng chưa chia sẻ: điền vào khoản Tiền sân trống, giữ nguyên phiên và suất', () => {
    const board = newBoard('2026-10-01');
    board.draft.weights = { A: 1, B: 1 };
    const slot = board.draft.expenses[0];
    const r = addCourtFee(board, fee);
    expect(r.draft.expenses).toHaveLength(2);
    expect(r.draft.expenses[0]).toMatchObject({ key: slot.key, qty: 1, unitPrice: 240000, payerId: 'A' });
    expect(r.draft.weights).toEqual({ A: 1, B: 1 });
    expect(r.session).toBe(board.session);
    expect(r.draft.date).toBe(fee.date);
  });

  it('không có người ứng mới thì giữ người ứng đã chọn trên khoản trống', () => {
    const board = newBoard('2026-10-01');
    board.draft.expenses[0].payerId = 'P';
    const r = addCourtFee(board, { ...fee, payerId: '' });
    expect(r.draft.expenses[0].payerId).toBe('P');
  });

  it('Tiền sân đã có giá (đặt lần hai): thêm khoản mới, không đụng khoản cũ', () => {
    const first = addCourtFee(newBoard('2026-10-01'), fee);
    const r = addCourtFee(first, { ...fee, amount: 100000 });
    expect(r.draft.expenses).toHaveLength(3);
    expect(r.draft.expenses[0]).toEqual(first.draft.expenses[0]);
    expect(r.draft.expenses[2]).toMatchObject({ label: 'Tiền sân', unitPrice: 100000, payerId: 'A' });
  });

  it('bảng đã chia sẻ: mở bảng mới với phiên khác, bỏ hết dữ liệu buổi cũ', () => {
    const old: SavedDraft = { ...newBoard('2026-10-01'), shared: true };
    old.draft.weights = { A: 1 };
    old.draft.expenses.push({ key: 'k', label: 'Nước', qty: 2, unitPrice: 10000, payerId: 'B' });
    const r = addCourtFee(old, fee);
    expect(r.session).not.toBe(old.session);
    expect(r.shared).toBe(false);
    expect(r.draft.weights).toEqual({});
    expect(r.draft.expenses.map((x) => [x.label, x.unitPrice])).toEqual([
      ['Tiền sân', 240000],
      ['Tiền cầu', 30000],
    ]);
  });
});
