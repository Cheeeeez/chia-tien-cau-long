export type BankInfo = { bin: string; accountNo: string; accountName: string };
export type Member = { id: string; name: string; bank: BankInfo | null };
// Payload nằm trong link (v1); dùng key ngắn để link gọn
export type BillPerson = { n: string; w: number; b?: [bin: string, accountNo: string, accountName: string] };
export type BillExpense = { l: string; q: number; u: number; by: number }; // label, số lượng, đơn giá (VND, nguyên), index người trả trong p
export type Bill = { v: 1; d: string /* YYYY-MM-DD */; p: BillPerson[]; e: BillExpense[] };
export type DraftExpense = { key: string; label: string; qty: number; unitPrice: number; payerId: string };
export type Draft = { date: string; expenses: DraftExpense[]; weights: Record<string, number> }; // memberId -> suất; không có key = không đi
