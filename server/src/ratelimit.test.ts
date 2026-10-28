import { describe, expect, it } from 'vitest';
import { FailureLimiter } from './ratelimit.js';

describe('FailureLimiter', () => {
  it('chặn sau đủ số lần sai, mở lại khi lần cũ nhất hết hạn', () => {
    const l = new FailureLimiter(3, 60_000);
    for (const t of [0, 1000, 2000]) {
      l.check('a', t);
      l.fail('a', t);
    }
    expect(() => l.check('a', 3000)).toThrow(/sau 1 phút/);
    expect(() => l.check('a', 60_001)).not.toThrow(); // lần sai đầu (t=0) đã quá 60 giây
  });

  it('khoá theo từng key và reset sau khi đăng nhập đúng', () => {
    const l = new FailureLimiter(1, 60_000);
    l.fail('a', 0);
    expect(() => l.check('b', 1)).not.toThrow();
    expect(() => l.check('a', 1)).toThrow();
    l.reset('a');
    expect(() => l.check('a', 2)).not.toThrow();
  });
});
