import type { Debt } from './types';

export const MANUAL = 'manual';

/** Nợ còn hiệu lực với phiên `session`: chưa dùng hoặc đang được chính phiên này dùng; bỏ khoản do chính phiên này sinh ra. */
export function openDebts(ledger: Debt[], session: string): Debt[] {
  return ledger.filter((d) => d.src !== session && (d.usedBy === undefined || d.usedBy === session));
}

/** Chốt bill của `session`; gọi lại trong cùng phiên cho kết quả như chỉ gọi lần cuối. */
export function commitBill(
  ledger: Debt[],
  session: string,
  applied: string[], // id các Debt đã cộng vào bill
  deferred: { from: string; to: string; amount: number; date: string }[],
): Debt[] {
  const used = new Set(applied);
  const kept = ledger
    .filter((d) => d.src !== session) // khoản phiên này sinh ở lần chốt trước: tạo lại bên dưới
    .filter((d) => d.usedBy === undefined || d.usedBy === session) // đã được bill của phiên cũ dùng: bỏ hẳn
    .map(({ usedBy: _, ...d }): Debt => (used.has(d.id) ? { ...d, usedBy: session } : d));
  return [...kept, ...deferred.map((x) => ({ ...x, id: crypto.randomUUID(), src: session }))];
}
