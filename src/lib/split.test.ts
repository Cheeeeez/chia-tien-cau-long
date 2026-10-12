import { describe, expect, it } from 'vitest';
import { settle } from './split';
import type { Bill } from './types';

const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
function mk(w: number[], e: [l: string, q: number, u: number, by: number][]): Bill {
  return {
    v: 1,
    d: '2026-10-12',
    p: w.map((x, i) => ({ n: names[i], w: x })),
    e: e.map(([l, q, u, by]) => ({ l, q, u, by })),
  };
}

function invariants(bill: Bill) {
  const s = settle(bill);
  expect(s.shares.reduce((a, b) => a + b, 0)).toBe(s.total);
  expect(s.balances.reduce((a, b) => a + b, 0)).toBe(0);
  for (const t of s.transfers) {
    expect(t.amount).toBeGreaterThanOrEqual(t.exact);
    expect(t.amount % 1000).toBe(0);
  }
  return s;
}

describe('settle', () => {
  it('chia đều 7 người, A trả hết', () => {
    const s = invariants(mk(Array(7).fill(1), [['sân', 1, 300000, 0], ['cầu', 5, 17000, 0]]));
    expect(s.shares).toEqual(Array(7).fill(55000));
    expect(s.transfers).toEqual(
      [1, 2, 3, 4, 5, 6].map((from) => ({ from, to: 0, exact: 55000, amount: 55000 })),
    );
  });

  it('phần dư chia cho người có index nhỏ trước, làm tròn lên từng giao dịch', () => {
    const s = invariants(mk(Array(7).fill(1), [['sân', 1, 400000, 0]]));
    expect(s.shares).toEqual([57143, 57143, 57143, 57143, 57143, 57143, 57142]);
    expect(s.transfers).toHaveLength(6);
    expect(s.transfers.every((t) => t.amount === 58000)).toBe(true);
  });

  it('chia theo hệ số', () => {
    const s = invariants(mk([1, 1, 0.5], [['sân', 1, 250000, 0]]));
    expect(s.shares).toEqual([100000, 100000, 50000]);
  });

  it('người ứng tiền cầu được người ứng tiền sân trả lại, không ai chuyển chéo', () => {
    // 440.000 / 8 = 55.000/người; A (sân) +245.000, B (cầu) +85.000
    const s = invariants(mk(Array(8).fill(1), [['Tiền sân', 1, 300000, 0], ['Tiền cầu', 1, 140000, 1]]));
    expect(s.transfers.map((t) => [names[t.from], names[t.to], t.amount])).toEqual([
      ['C', 'A', 55000],
      ['D', 'A', 55000],
      ['E', 'A', 55000],
      ['F', 'A', 55000],
      ['G', 'A', 55000],
      ['H', 'A', 55000],
      ['A', 'B', 85000],
    ]);
  });

  it('người ứng tiền cầu thiếu phần mình thì chuyển cho người ứng sân', () => {
    const s = invariants(mk([1, 1, 1, 0.5], [['Tiền sân', 1, 300000, 0], ['Tiền cầu', 4, 25000, 1]]));
    expect(s.transfers.map((t) => [names[t.from], names[t.to], t.amount])).toEqual([
      ['C', 'A', 115000],
      ['D', 'A', 58000],
      ['B', 'A', 15000],
    ]);
  });

  it('hub là người ứng khoản "sân" dù không phải khoản đầu tiên', () => {
    const s = invariants(mk([1, 1, 1], [['Cầu', 1, 30000, 0], ['SÂN', 1, 120000, 1]]));
    expect(s.transfers.every((t) => t.from === 1 || t.to === 1)).toBe(true);
    expect(s.transfers.map((t) => [names[t.from], names[t.to], t.amount])).toEqual([
      ['C', 'B', 50000],
      ['A', 'B', 20000],
    ]);
  });

  it('không có khoản nào ghi "sân" thì hub là người ứng khoản đầu tiên', () => {
    const s = invariants(mk([1, 1], [['Thuê', 1, 100000, 1], ['Cầu', 1, 20000, 0]]));
    expect(s.transfers.map((t) => [names[t.from], names[t.to], t.amount])).toEqual([['A', 'B', 40000]]);
  });

  it('người trả không đi (w = 0)', () => {
    const s = invariants(mk([0, 1, 1], [['sân', 1, 200000, 0]]));
    expect(s.shares).toEqual([0, 100000, 100000]);
    expect(s.transfers.map((t) => [t.from, t.to, t.amount])).toEqual([
      [1, 0, 100000],
      [2, 0, 100000],
    ]);
  });

  it('không ai chuyển khi tự trả phần mình', () => {
    const s = invariants(mk([1], [['sân', 1, 100000, 0]]));
    expect(s.transfers).toEqual([]);
  });
});
