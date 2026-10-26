import { expenseAmount, roundUpThousand } from './money';
import { toAsciiUpper } from './text';
import type { Bill } from './types';

export type Transfer = { from: number; to: number; exact: number; amount: number };
export type Settlement = {
  total: number;
  shares: number[];
  paid: number[];
  balances: number[];
  transfers: Transfer[]; // chuyển ngay
  deferred: Transfer[]; // để lần sau
};

/** Người ứng tiền sân: payer của khoản đầu tiên có nhãn chứa "sân"; không có thì payer của khoản đầu tiên. */
export function findHub(bill: Bill): number {
  const court = bill.e.find((x) => /\bSAN\b/.test(toAsciiUpper(x.l)));
  return (court ?? bill.e[0]).by;
}

/** Chia `amount` cho `members` (index tăng dần, units > 0) theo phần dư lớn nhất, cộng dồn vào `shares`. */
function allocate(amount: number, members: number[], units: number[], shares: number[]): void {
  const U = members.reduce((a, i) => a + units[i], 0);
  if (U === 0) return;
  const rems: number[] = [];
  let given = 0;
  for (const i of members) {
    const raw = amount * units[i];
    const base = Math.floor(raw / U);
    shares[i] += base;
    given += base;
    rems.push(raw % U);
  }
  let leftover = amount - given;
  const order = rems.map((_, j) => j).sort((a, b) => rems[b] - rems[a] || a - b);
  for (const j of order) {
    if (leftover <= 0) break;
    shares[members[j]] += 1;
    leftover -= 1;
  }
}

export function settle(bill: Bill): Settlement {
  const n = bill.p.length;
  const amounts = bill.e.map((x) => expenseAmount(x.q, x.u));
  const total = amounts.reduce((a, b) => a + b, 0);

  // Gộp các khoản cùng nhóm người chia (chỉ tính người có suất > 0), mỗi nhóm chia theo hệ số và phần dư lớn nhất; toàn bộ là số nguyên đồng.
  const units = bill.p.map((x) => Math.round(x.w * 2));
  const shares = new Array<number>(n).fill(0);
  const groups = new Map<string, { members: number[]; amount: number }>();
  bill.e.forEach((x, k) => {
    const members = (x.s ?? bill.p.map((_, i) => i)).filter((i) => units[i] > 0);
    const key = members.join(',');
    const g = groups.get(key);
    if (g) g.amount += amounts[k];
    else groups.set(key, { members, amount: amounts[k] });
  });
  for (const g of groups.values()) allocate(g.amount, g.members, units, shares);

  const paid = new Array<number>(n).fill(0);
  bill.e.forEach((x, k) => {
    paid[x.by] += amounts[k];
  });
  const balances = paid.map((p, i) => p - shares[i]);
  // Nợ cũ cộng vào bill: không đổi shares/paid/total, tổng balances vẫn bằng 0.
  for (const [f, t, amt] of bill.a ?? []) {
    balances[f] -= amt;
    balances[t] += amt;
  }

  // Chỉ chuyển cho / nhận từ người ứng tiền sân (hub); người ứng tiền cầu được hub trả lại nếu dư.
  const hub = findHub(bill);
  const byAbsDesc = (a: number, b: number) =>
    Math.abs(balances[b]) - Math.abs(balances[a]) || a - b;
  const others = balances.map((_, i) => i).filter((i) => i !== hub);
  const debtors = others.filter((i) => balances[i] < 0).sort(byAbsDesc);
  const creditors = others.filter((i) => balances[i] > 0).sort(byAbsDesc);
  const all: Transfer[] = [
    ...debtors.map((i) => ({ from: i, to: hub, exact: -balances[i], amount: roundUpThousand(-balances[i]) })),
    ...creditors.map((i) => ({ from: hub, to: i, exact: balances[i], amount: roundUpThousand(balances[i]) })),
  ];

  const isDeferred = (t: Transfer) => (bill.k ?? []).some(([f, to]) => f === t.from && to === t.to);
  return {
    total,
    shares,
    paid,
    balances,
    transfers: all.filter((t) => !isDeferred(t)),
    deferred: all.filter(isDeferred),
  };
}
