import type { DraftExpense, SavedDraft } from './types';

export const COURT_FEE_LABEL = 'Tiền sân';
export const SHUTTLE_PRICE = 30000;

export const newExpense = (label: string, unitPrice = 0): DraftExpense => ({
  key: crypto.randomUUID(),
  label,
  qty: 1,
  unitPrice,
  payerId: '',
});

/** Bảng mới: phiên sổ nợ mới, khoản mặc định "Tiền sân" (chưa có giá) và "Tiền cầu". */
export function newBoard(date: string): SavedDraft {
  return {
    session: crypto.randomUUID(),
    shared: false,
    draft: { date, expenses: [newExpense(COURT_FEE_LABEL), newExpense('Tiền cầu', SHUTTLE_PRICE)], weights: {}, defer: [] },
  };
}

/** Cộng tiền sân vừa đặt vào bảng đã lưu. Bảng đã chia sẻ là buổi cũ nên mở bảng mới. Điền vào khoản "Tiền sân" chưa có giá đầu tiên; không có thì thêm khoản mới. Ngày của bảng đổi thành ngày đặt sân. */
export function addCourtFee(
  saved: SavedDraft | null,
  fee: { amount: number; date: string; payerId: string },
): SavedDraft {
  const board = saved && !saved.shared ? saved : newBoard(fee.date);
  const { draft } = board;
  const slot = draft.expenses.find((x) => x.label.trim() === COURT_FEE_LABEL && x.unitPrice === 0);
  const expenses = slot
    ? draft.expenses.map((x) => (x === slot ? { ...x, qty: 1, unitPrice: fee.amount, payerId: fee.payerId || x.payerId } : x))
    : [...draft.expenses, { ...newExpense(COURT_FEE_LABEL, fee.amount), payerId: fee.payerId }];
  return { ...board, draft: { ...draft, date: fee.date, expenses } };
}
