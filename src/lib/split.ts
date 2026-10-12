import { expenseAmount, roundUpThousand } from './money';
import { toAsciiUpper } from './text';
import type { Bill } from './types';

export type Transfer = { from: number; to: number; exact: number; amount: number };
export type Settlement = {
  total: number;
  shares: number[];
  paid: number[];
  balances: number[];
  transfers: Transfer[];
};

/** Người ứng tiền sân: payer của khoản đầu tiên có nhãn chứa "sân"; không có thì payer của khoản đầu tiên. */
export function findHub(bill: Bill): number {
  const court = bill.e.find((x) => /\bSAN\b/.test(toAsciiUpper(x.l)));
  return (court ?? bill.e[0]).by;
}

export function settle(bill: Bill): Settlement {
  const n = bill.p.length;
  const amounts = bill.e.map((x) => expenseAmount(x.q, x.u));
  const total = amounts.reduce((a, b) => a + b, 0);

  // Chia theo hệ số, phần dư lớn nhất; toàn bộ là số nguyên đồng.
  const units = bill.p.map((x) => Math.round(x.w * 2));
  const U = units.reduce((a, b) => a + b, 0);
  const shares = new Array<number>(n).fill(0);
  if (U > 0) {
    const rems: number[] = [];
    for (let i = 0; i < n; i++) {
      const raw = total * units[i];
      shares[i] = Math.floor(raw / U);
      rems.push(raw % U);
    }
    let leftover = total - shares.reduce((a, b) => a + b, 0);
    const order = rems.map((_, i) => i).sort((a, b) => rems[b] - rems[a] || a - b);
    for (const i of order) {
      if (leftover <= 0) break;
      shares[i] += 1;
      leftover -= 1;
    }
  }

  const paid = new Array<number>(n).fill(0);
  bill.e.forEach((x, k) => {
    paid[x.by] += amounts[k];
  });
  const balances = paid.map((p, i) => p - shares[i]);

  // Chỉ chuyển cho / nhận từ người ứng tiền sân (hub); người ứng tiền cầu được hub trả lại nếu dư.
  const hub = findHub(bill);
  const byAbsDesc = (a: number, b: number) =>
    Math.abs(balances[b]) - Math.abs(balances[a]) || a - b;
  const others = balances.map((_, i) => i).filter((i) => i !== hub);
  const debtors = others.filter((i) => balances[i] < 0).sort(byAbsDesc);
  const creditors = others.filter((i) => balances[i] > 0).sort(byAbsDesc);
  const transfers: Transfer[] = [
    ...debtors.map((i) => ({ from: i, to: hub, exact: -balances[i], amount: roundUpThousand(-balances[i]) })),
    ...creditors.map((i) => ({ from: hub, to: i, exact: balances[i], amount: roundUpThousand(balances[i]) })),
  ];

  return { total, shares, paid, balances, transfers };
}
