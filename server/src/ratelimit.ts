import { HttpError } from './errors.js';

/** Chặn thử sai liên tục: quá `max` lần thất bại trong `windowMs` thì từ chối đến khi lần cũ nhất hết hạn. */
export class FailureLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length > 0) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Ném 429 nếu `key` đã thất bại quá nhiều. */
  check(key: string, now = Date.now()): void {
    const list = this.recent(key, now);
    if (list.length >= this.max) {
      const minutes = Math.ceil((list[0] + this.windowMs - now) / 60_000);
      throw new HttpError(`Thử sai quá nhiều lần, thử lại sau ${minutes} phút`, 429);
    }
  }

  fail(key: string, now = Date.now()): void {
    this.hits.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
