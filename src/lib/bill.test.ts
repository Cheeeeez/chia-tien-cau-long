import { describe, expect, it } from 'vitest';
import { decodeBill, deferKey, draftToBill, encodeBill, validateDraft } from './bill';
import { buildMessage, expenseLine } from './message';
import { settle } from './split';
import type { Bill, Debt, Draft, Member } from './types';

const bill: Bill = {
  v: 1,
  d: '2026-10-12',
  p: [
    { n: 'Nguyễn Văn Đạt', w: 1, b: ['970422', '0123456789', 'NGUYEN VAN DAT'] },
    { n: 'Bình', w: 0.5 },
  ],
  e: [{ l: 'Tiền sân', q: 1, u: 300000, by: 0 }],
};

const enc = (x: unknown) => encodeBill(x as Bill);

describe('encode/decode', () => {
  it('round-trip tiếng Việt, chỉ gồm ký tự URL-safe', () => {
    const s = encodeBill(bill);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeBill(s)).toEqual(bill);
  });

  it('round-trip bill có nợ cũ (a) và khoản để lần sau (k)', () => {
    const withCarry: Bill = { ...bill, a: [[1, 0, 15000, '2026-10-05']], k: [[1, 0]] };
    expect(decodeBill(encodeBill(withCarry))).toEqual(withCarry);
  });

  it('từ chối dữ liệu sai', () => {
    expect(() => decodeBill('abc')).toThrow('Link chia tiền không hợp lệ');
    expect(() => decodeBill('###')).toThrow('Link chia tiền không hợp lệ');
    expect(() => decodeBill(enc({ ...bill, e: [{ ...bill.e[0], by: 2 }] }))).toThrow();
    expect(() => decodeBill(enc({ ...bill, p: [{ n: 'A', w: 0.3 }] }))).toThrow();
    expect(() => decodeBill(enc({ ...bill, p: [{ n: 'A', w: 0 }, { n: 'B', w: 0 }] }))).toThrow();
  });

  it('từ chối a/k sai', () => {
    expect(() => decodeBill(enc({ ...bill, a: [[1, 1, 5000, '2026-10-05']] }))).toThrow();
    expect(() => decodeBill(enc({ ...bill, a: [[1, 0, 0, '2026-10-05']] }))).toThrow();
    expect(() => decodeBill(enc({ ...bill, a: [[1, 0, 5000, '12/10']] }))).toThrow();
    expect(() => decodeBill(enc({ ...bill, k: [[1, 2]] }))).toThrow();
  });

  it('round-trip khoản có s; từ chối s sai', () => {
    const withS: Bill = { ...bill, e: [...bill.e, { l: 'Sân', q: 1, u: 100000, by: 0, s: [1] }] };
    expect(decodeBill(encodeBill(withS))).toEqual(withS);
    for (const s of [[], [1, 0], [0, 0], [2]]) {
      expect(() => decodeBill(enc({ ...bill, e: [{ ...bill.e[0], s }] }))).toThrow();
    }
    expect(() =>
      decodeBill(enc({ ...bill, p: [bill.p[0], { n: 'Bình', w: 0 }], e: [{ ...bill.e[0], s: [1] }] })),
    ).toThrow();
  });
});

const roster = (withBank: boolean): Member[] => [
  { id: 'a', name: 'An', bank: withBank ? { bin: '970422', accountNo: '0123456789', accountName: 'AN' } : null },
  { id: 'b', name: 'Bình', bank: { bin: '970436', accountNo: '1234567890', accountName: 'BINH' } },
  { id: 'c', name: 'Chi', bank: null },
];
const draft = (over: Partial<Draft> = {}): Draft => ({
  date: '2026-10-12',
  expenses: [{ key: '1', label: ' ', qty: 1, unitPrice: 300000, payerId: 'a' }],
  weights: { b: 1, c: 1 },
  defer: [],
  ...over,
});

describe('draftToBill', () => {
  it('nối payer không đi vào cuối với w = 0, chỉ payer có b', () => {
    const b = draftToBill(roster(true), draft(), []);
    expect(b.p.map((p) => [p.n, p.w, !!p.b])).toEqual([
      ['Bình', 1, false],
      ['Chi', 1, false],
      ['An', 0, true],
    ]);
    expect(b.e).toEqual([{ l: 'Khoản khác', q: 1, u: 300000, by: 2 }]);
    expect(b.a).toBeUndefined();
    expect(b.k).toBeUndefined();
  });

  const debt = (from: string, to: string): Debt => ({
    id: `${from}${to}`,
    from,
    to,
    amount: 5000,
    date: '2026-10-05',
    src: 'manual',
  });

  it('nợ có cả hai người trong bill thì vào a theo index của p', () => {
    // p = [Bình, Chi, An]
    expect(draftToBill(roster(true), draft(), [debt('c', 'a')]).a).toEqual([[1, 2, 5000, '2026-10-05']]);
  });

  it('nợ có người vắng mặt thì không vào bill', () => {
    const b = draftToBill(roster(true), draft({ weights: { b: 1 } }), [debt('c', 'a')]);
    expect(b.a).toBeUndefined();
  });

  it('người nhận nợ không ứng gì nhưng có bank thì được gắn b', () => {
    const b = draftToBill(roster(true), draft(), [debt('c', 'b')]);
    expect(b.p[0].b).toEqual(['970436', '1234567890', 'BINH']);
  });

  it('defer khớp khoản chuyển thì sinh k; không khớp thì bỏ qua', () => {
    // p = [Bình, Chi, An]; Bình → An là khoản chuyển (0 → 2)
    expect(draftToBill(roster(true), draft({ defer: [deferKey('b', 'a')] }), []).k).toEqual([[0, 2]]);
    expect(draftToBill(roster(true), draft({ defer: [deferKey('a', 'b')] }), []).k).toBeUndefined();
  });

  it('sharers: chỉ giữ người chơi, chọn đủ thì không ghi s', () => {
    // p = [Bình, Chi, An]; An chỉ ứng
    const withSharers = (sharers: string[]) => ({
      expenses: [{ key: '1', label: 'Sân', qty: 1, unitPrice: 300000, payerId: 'a', sharers }],
    });
    const b = draftToBill(roster(true), draft(withSharers(['c'])), []);
    expect(b.e[0].s).toEqual([1]);
    expect(expenseLine(b, 0).endsWith('(An ứng, chia cho Chi)')).toBe(true);
    expect(draftToBill(roster(true), draft(withSharers(['c', 'b'])), []).e[0].s).toBeUndefined();
    expect(draftToBill(roster(true), draft(withSharers(['a', 'c'])), []).e[0].s).toEqual([1]);
    expect('s' in draftToBill(roster(true), draft(withSharers(['c', 'b'])), []).e[0]).toBe(false);
  });
});

describe('validateDraft', () => {
  it('báo thiếu thông tin ngân hàng của chủ nợ', () => {
    expect(validateDraft(roster(false), draft(), [])).toEqual(['An cần nhận tiền nhưng chưa có thông tin ngân hàng']);
    expect(validateDraft(roster(true), draft(), [])).toEqual([]);
  });

  it('khoản chuyển tới người chưa có ngân hàng mà đã để lần sau thì không báo lỗi', () => {
    const defer = [deferKey('b', 'a'), deferKey('c', 'a')];
    expect(validateDraft(roster(false), draft({ defer }), [])).toEqual([]);
  });

  it('báo lỗi theo thứ tự', () => {
    expect(validateDraft(roster(true), draft({ expenses: [], weights: {} }), [])).toEqual([
      'Chưa có khoản chi nào',
      'Chưa chọn người đi',
    ]);
    expect(
      validateDraft(
        roster(true),
        draft({ expenses: [{ key: '1', label: 'Tiền cầu', qty: 1, unitPrice: 5000, payerId: '' }] }),
        [],
      ),
    ).toEqual(['Khoản "Tiền cầu" chưa chọn người trả']);
  });

  it('cho phép suất 0 nhưng phải có ít nhất một người suất > 0', () => {
    expect(validateDraft(roster(true), draft({ weights: { a: 1, b: 1, c: 0 } }), [])).toEqual([]);
    expect(validateDraft(roster(true), draft({ weights: { b: 0, c: 0 } }), [])).toEqual([
      'Cần ít nhất một người có suất lớn hơn 0',
    ]);
  });

  it('khoản có sharers rỗng hoặc chỉ gồm người không chơi thì báo lỗi', () => {
    const expenses = (sharers: string[]) => [
      { key: '1', label: 'Tiền sân', qty: 1, unitPrice: 300000, payerId: 'a', sharers },
    ];
    const err = ['Khoản "Tiền sân" chưa chọn người chia'];
    expect(validateDraft(roster(true), draft({ expenses: expenses([]) }), [])).toEqual(err);
    expect(validateDraft(roster(true), draft({ expenses: expenses(['a']) }), [])).toEqual(err);
  });

  it('đi cùng (suất 0 được tick) đánh dấu g, người chỉ ứng tiền thì không', () => {
    const b = draftToBill(roster(true), draft({ weights: { b: 1, c: 0 } }), []);
    expect(b.p.map((p) => [p.n, p.w, p.g])).toEqual([
      ['Bình', 1, undefined],
      ['Chi', 0, 1],
      ['An', 0, undefined],
    ]);
    expect(decodeBill(encodeBill(b))).toEqual(b);
    expect(() => decodeBill(encodeBill({ ...b, p: [{ ...b.p[0], g: 1 }, ...b.p.slice(1)] }))).toThrow();
    expect(buildMessage(b, settle(b), 'u')).toContain('2 người chơi');
  });
});
