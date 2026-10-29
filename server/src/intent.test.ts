import { describe, expect, it } from 'vitest';
import { normalizePhone, validateIntent } from './intent.js';

const today = '2026-10-28';
const ok = { date: '2026-10-30', start: '18:00', end: '20:00', court: null };

describe('validateIntent', () => {
  it('chấp nhận hợp lệ, kể cả 24:00', () => {
    expect(validateIntent(ok, today)).toEqual(ok);
    expect(validateIntent({ ...ok, start: '23:30', end: '24:00', court: 10 }, today).end).toBe('24:00');
  });
  it.each([
    ['đúng ca 18:00-20:00', '18:00', '20:00'],
    ['trùm cả ca', '17:00', '21:00'],
    ['sát trước ca', '17:00', '18:00'],
    ['sát sau ca', '20:00', '21:30'],
  ])('chấp nhận %s', (_, start, end) => {
    expect(validateIntent({ ...ok, start, end }, today)).toMatchObject({ start, end });
  });
  it.each([
    ['ngày quá khứ', { date: '2026-10-27' }],
    ['ngày không có thật', { date: '2026-02-30' }],
    ['phút lẻ', { start: '19:15' }],
    ['start ≥ end', { start: '21:00' }],
    ['trước 05:00', { start: '04:30' }],
    ['sân 11', { court: 11 }],
    ['cắt ngang ca: 17:00-19:00', { start: '17:00', end: '19:00' }],
    ['cắt ngang ca: 19:00-21:00', { start: '19:00', end: '21:00' }],
    ['nằm trong ca: 18:30-19:30', { start: '18:30', end: '19:30' }],
    ['nửa ca: 18:00-19:00', { start: '18:00', end: '19:00' }],
  ])('từ chối %s', (_, patch) => {
    expect(() => validateIntent({ ...ok, ...patch }, today)).toThrow();
  });
});

describe('normalizePhone', () => {
  it.each(['+84 912 345 678', '0912345678', '84912345678'])('%s', (p) => {
    expect(normalizePhone(p)).toBe('912345678');
  });
  it('từ chối số sai', () => expect(() => normalizePhone('012345')).toThrow());
});
