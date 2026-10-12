import { settle } from './split';
import type { Bill, BillPerson, Draft, Member } from './types';

const BAD = 'Link chia tiền không hợp lệ';

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error(BAD);
  const std = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeBill(bill: Bill): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(bill)));
}

const isStr = (x: unknown, min: number, max: number): x is string =>
  typeof x === 'string' && x.length >= min && x.length <= max;
const isInt = (x: unknown, min: number, max: number): x is number =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;

function assertBill(x: unknown): asserts x is Bill {
  const fail = (): never => {
    throw new Error(BAD);
  };
  if (typeof x !== 'object' || x === null) return fail();
  const o = x as Record<string, unknown>;
  if (o.v !== 1) fail();
  if (typeof o.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.d)) fail();
  if (!Array.isArray(o.p) || o.p.length < 1 || o.p.length > 60) fail();
  if (!Array.isArray(o.e) || o.e.length < 1 || o.e.length > 20) fail();
  let sumW = 0;
  for (const p of o.p as unknown[]) {
    if (typeof p !== 'object' || p === null) return fail();
    const q = p as Record<string, unknown>;
    if (!isStr(q.n, 1, 40) || q.n !== q.n.trim()) fail();
    if (typeof q.w !== 'number' || !Number.isFinite(q.w) || q.w < 0 || q.w > 10) fail();
    if (!Number.isInteger((q.w as number) * 2)) fail();
    sumW += q.w as number;
    if (q.b !== undefined) {
      const b = q.b;
      if (!Array.isArray(b) || b.length !== 3) return fail();
      if (typeof b[0] !== 'string' || !/^\d{6}$/.test(b[0])) fail();
      if (typeof b[1] !== 'string' || !/^[A-Za-z0-9]{1,19}$/.test(b[1])) fail();
      if (!isStr(b[2], 0, 50)) fail();
    }
  }
  if (!(sumW > 0)) fail();
  for (const e of o.e as unknown[]) {
    if (typeof e !== 'object' || e === null) return fail();
    const q = e as Record<string, unknown>;
    if (!isStr(q.l, 1, 40)) fail();
    if (typeof q.q !== 'number' || !Number.isFinite(q.q) || q.q <= 0 || q.q > 1000) fail();
    if (!isInt(q.u, 1, 100_000_000)) fail();
    if (!isInt(q.by, 0, (o.p as unknown[]).length - 1)) fail();
  }
}

export function decodeBill(s: string): Bill {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(s)));
  } catch {
    throw new Error(BAD);
  }
  assertBill(parsed);
  return parsed;
}

export const billUrl = (base: string, bill: Bill): string => `${base}?b=${encodeBill(bill)}`;

export function draftToBill(roster: Member[], draft: Draft): Bill {
  const byId = new Map(roster.map((m) => [m.id, m]));
  const valid = draft.expenses.filter((x) => x.qty > 0 && x.unitPrice > 0 && byId.has(x.payerId));
  const payerIds = new Set(valid.map((x) => x.payerId));

  const ids: string[] = roster.filter((m) => draft.weights[m.id] !== undefined).map((m) => m.id);
  for (const m of roster) if (payerIds.has(m.id) && !ids.includes(m.id)) ids.push(m.id);

  const p: BillPerson[] = ids.map((id) => {
    const m = byId.get(id)!;
    const person: BillPerson = { n: m.name.trim().slice(0, 40), w: draft.weights[id] ?? 0 };
    if (payerIds.has(id) && m.bank) {
      person.b = [m.bank.bin, m.bank.accountNo, m.bank.accountName];
    }
    return person;
  });

  const e = valid.map((x) => ({
    l: x.label.trim().slice(0, 40) || 'Khoản khác',
    q: x.qty,
    u: x.unitPrice,
    by: ids.indexOf(x.payerId),
  }));
  return { v: 1, d: draft.date, p, e };
}

export function validateDraft(roster: Member[], draft: Draft): string[] {
  const errors: string[] = [];
  const priced = draft.expenses.filter((x) => x.qty > 0 && x.unitPrice > 0);
  if (priced.length === 0) errors.push('Chưa có khoản chi nào');
  for (const x of priced) {
    if (!x.payerId || !roster.some((m) => m.id === x.payerId)) {
      errors.push(`Khoản "${x.label.trim() || 'Khoản khác'}" chưa chọn người trả`);
    }
  }
  if (!roster.some((m) => draft.weights[m.id] !== undefined)) errors.push('Chưa chọn người đi');
  if (errors.length > 0) return errors;

  const bill = draftToBill(roster, draft);
  const s = settle(bill);
  const missing = new Set<number>();
  for (const t of s.transfers) if (!bill.p[t.to].b) missing.add(t.to);
  for (const i of [...missing].sort((x, y) => x - y)) {
    errors.push(`${bill.p[i].n} ứng tiền nhưng chưa có thông tin ngân hàng`);
  }
  return errors;
}
