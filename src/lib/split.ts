import { expenseAmount, roundUpThousand } from './money';
import type { Bill } from './types';

export type Transfer = { from: number; to: number; exact: number; amount: number };
export type Settlement = {
  total: number;
  shares: number[];
  paid: number[];
  balances: number[];
  transfers: Transfer[];
};

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

  const byAbsDesc = (a: number, b: number) =>
    Math.abs(balances[b]) - Math.abs(balances[a]) || a - b;
  const creditors = balances.map((_, i) => i).filter((i) => balances[i] > 0).sort(byAbsDesc);
  const debtors = balances.map((_, i) => i).filter((i) => balances[i] < 0).sort(byAbsDesc);

  const credit = creditors.map((i) => balances[i]);
  const debt = debtors.map((i) => -balances[i]);
  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const x = Math.min(credit[ci], debt[di]);
    transfers.push({ from: debtors[di], to: creditors[ci], exact: x, amount: roundUpThousand(x) });
    credit[ci] -= x;
    debt[di] -= x;
    if (credit[ci] === 0) ci++;
    if (debt[di] === 0) di++;
  }

  return { total, shares, paid, balances, transfers };
}
