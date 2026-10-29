import { describe, expect, it } from 'vitest';
import { fixedBlockError } from './booking';

describe('fixedBlockError', () => {
  it.each([
    ['18:00', '20:00'],
    ['17:00', '21:00'],
    ['17:00', '18:00'],
    ['20:00', '22:00'],
  ])('%s-%s hợp lệ', (s, e) => expect(fixedBlockError(s, e)).toBeNull());

  it.each([
    ['17:00', '19:00'],
    ['19:00', '21:00'],
    ['18:00', '19:00'],
    ['19:00', '20:00'],
    ['18:30', '19:30'],
  ])('%s-%s cắt ngang ca', (s, e) => expect(fixedBlockError(s, e)).not.toBeNull());
});
