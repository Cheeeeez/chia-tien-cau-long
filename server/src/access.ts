import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** So mã truy cập gửi lên với mã của máy chủ, thời gian không phụ thuộc vị trí ký tự khác nhau. */
export function matchesAccessCode(given: unknown, expected: string): boolean {
  return timingSafeEqual(digest(typeof given === 'string' ? given : ''), digest(expected));
}
