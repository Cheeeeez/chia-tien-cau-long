export type BankInfo = { bin: string; accountNo: string; accountName: string };
export type Member = { id: string; name: string; bank: BankInfo | null };
// Payload nằm trong link (v1); dùng key ngắn để link gọn
/** w: suất; g: 1 = có đi nhưng suất 0 (đi cùng). Suất 0 không có g = chỉ ứng tiền, không đi. */
export type BillPerson = { n: string; w: number; g?: 1; b?: [bin: string, accountNo: string, accountName: string] };
export type BillExpense = { l: string; q: number; u: number; by: number; s?: number[] }; // label, số lượng, đơn giá (VND, nguyên), index người trả trong p; s: index trong p của những người chia khoản này, tăng dần; không có = mọi người theo suất
/** Nợ cộng vào bill: p[from] nợ p[to] `amount` đồng, phát sinh ngày `date` (YYYY-MM-DD). */
export type BillCarry = [from: number, to: number, amount: number, date: string];
/** a: nợ cũ cộng vào bill; k: các cặp chuyển khoản (from, to) (index trong p) để lần sau. */
export type Bill = {
  v: 1;
  d: string /* YYYY-MM-DD */;
  p: BillPerson[];
  e: BillExpense[];
  a?: BillCarry[];
  k?: [from: number, to: number][];
};
export type DraftExpense = {
  key: string;
  label: string;
  qty: number;
  unitPrice: number;
  payerId: string;
  sharers?: string[]; // memberId của những người chia khoản này; undefined = tất cả người đi
};
export type Draft = {
  date: string;
  expenses: DraftExpense[];
  weights: Record<string, number>; // memberId -> suất; không có key = không đi
  defer: string[]; // deferKey(fromId, toId) của các khoản chuyển bấm "Để lần sau"
};
/** Khoản nợ chờ trong localStorage. src: id phiên đã sinh ra nó, hoặc 'manual'. usedBy: id phiên đã cộng nó vào bill. */
export type Debt = { id: string; from: string; to: string; amount: number; date: string; src: string; usedBy?: string };
/** Bảng chia tiền đang làm, lưu localStorage. session: id phiên của sổ nợ (Debt.src/usedBy); shared: đã bấm Chia sẻ/Copy ít nhất một lần. */
export type SavedDraft = { session: string; shared: boolean; draft: Draft };
