import { describe, expect, it } from 'vitest';
import { matchesAccessCode } from './access.js';

describe('matchesAccessCode', () => {
  const code = '2a6f2b1ee20defcc9a9949e056c4b9fa';

  it('chỉ nhận đúng mã', () => {
    expect(matchesAccessCode(code, code)).toBe(true);
    expect(matchesAccessCode(code.slice(0, -1), code)).toBe(false);
    expect(matchesAccessCode(code + 'x', code)).toBe(false);
    expect(matchesAccessCode(code.toUpperCase(), code)).toBe(false);
  });

  it('thiếu header hoặc kiểu lạ thì từ chối', () => {
    expect(matchesAccessCode(undefined, code)).toBe(false);
    expect(matchesAccessCode(['a'], code)).toBe(false);
    expect(matchesAccessCode('', code)).toBe(false);
  });
});
