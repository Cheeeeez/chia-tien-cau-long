import { expenseAmount, formatVnd } from './money';
import type { Settlement } from './split';
import { formatDate } from './text';
import type { Bill, BillCarry } from './types';

export function expenseLine(bill: Bill, i: number): string {
  const x = bill.e[i];
  const amount = expenseAmount(x.q, x.u);
  const payer = bill.p[x.by].n;
  return x.q === 1
    ? `${x.l}: ${formatVnd(amount)} (${payer} ứng)`
    : `${x.l}: ${x.q} × ${formatVnd(x.u)} = ${formatVnd(amount)} (${payer} ứng)`;
}

export const transferLine = (bill: Bill, t: Settlement['transfers'][number]): string =>
  `${bill.p[t.from].n} → ${bill.p[t.to].n}: ${formatVnd(t.amount)}`;

export const carryLine = (bill: Bill, c: BillCarry): string =>
  `${bill.p[c[0]].n} → ${bill.p[c[1]].n}: ${formatVnd(c[2])} (từ ${formatDate(c[3])})`;

export function buildMessage(bill: Bill, s: Settlement, url: string): string {
  const lines = [`🏸 Cầu lông ${formatDate(bill.d)} – tổng ${formatVnd(s.total)}`];
  bill.e.forEach((_, i) => lines.push(expenseLine(bill, i)));
  if (bill.a?.length) {
    lines.push('Nợ lần trước:');
    for (const c of bill.a) lines.push(`- ${carryLine(bill, c)}`);
  }
  const players = bill.p.filter((p) => p.w > 0).length;
  lines.push(`${players} người chơi, số tiền chuyển đã làm tròn lên 1.000đ.`);
  if (s.transfers.length === 0) {
    lines.push('Không ai cần chuyển khoản.');
  } else {
    lines.push('Chuyển khoản:');
    for (const t of s.transfers) lines.push(`- ${transferLine(bill, t)}`);
  }
  if (s.deferred.length > 0) {
    lines.push('Để lần sau (cộng vào lần chơi sau):');
    for (const t of s.deferred) lines.push(`- ${transferLine(bill, t)}`);
  }
  lines.push('Mở link để lấy mã QR / mở app ngân hàng:');
  lines.push(url);
  return lines.join('\n');
}
