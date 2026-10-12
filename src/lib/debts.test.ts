import { describe, expect, it } from 'vitest';
import { MANUAL, commitBill, openDebts } from './debts';
import type { Debt } from './types';

const debt = (over: Partial<Debt>): Debt => ({
  id: 'x',
  from: 'b',
  to: 'a',
  amount: 15000,
  date: '2026-10-05',
  src: MANUAL,
  ...over,
});
const later = (amount: number) => ({ from: 'b', to: 'a', amount, date: '2026-10-12' });

describe('commitBill', () => {
  it('chốt nhiều lần cùng phiên chỉ giữ khoản để lần sau của lần cuối', () => {
    const once = commitBill([], 'S', [], [later(15000)]);
    const twice = commitBill(once, 'S', [], [later(20000)]);
    expect(twice.filter((d) => d.src === 'S').map((d) => d.amount)).toEqual([20000]);
    expect(twice).toHaveLength(1);
  });

  it('lần chốt sau không còn cộng khoản X thì X mất usedBy', () => {
    const ledger = [debt({ id: 'X' })];
    const first = commitBill(ledger, 'S', ['X'], []);
    expect(first[0].usedBy).toBe('S');
    const second = commitBill(first, 'S', [], []);
    expect(second).toEqual([debt({ id: 'X' })]);
  });

  it('khoản đã được bill của phiên khác dùng thì bị bỏ', () => {
    const ledger = [debt({ id: 'X', usedBy: 'OLD' }), debt({ id: 'Y' })];
    expect(commitBill(ledger, 'S', [], []).map((d) => d.id)).toEqual(['Y']);
  });
});

describe('openDebts', () => {
  it('loại khoản do chính phiên sinh ra nhưng giữ khoản nhập tay', () => {
    const ledger = [debt({ id: 'own', src: 'S' }), debt({ id: 'manual' }), debt({ id: 'old', src: 'P' })];
    expect(openDebts(ledger, 'S').map((d) => d.id)).toEqual(['manual', 'old']);
  });

  it('giữ khoản do phiên này dùng, loại khoản phiên khác dùng', () => {
    const ledger = [debt({ id: 'mine', usedBy: 'S' }), debt({ id: 'theirs', usedBy: 'P' })];
    expect(openDebts(ledger, 'S').map((d) => d.id)).toEqual(['mine']);
  });
});
