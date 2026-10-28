import { HttpError } from './errors.js';

/**
 * Giới hạn số phiên trình duyệt chạy đồng thời (mỗi phiên tốn ~0,5–1 GB RAM).
 * Người đến sau xếp hàng chờ tối đa `waitMs` rồi báo bận.
 */
export class Pool {
  private free: number;
  private waiters: (() => void)[] = [];

  constructor(size: number) {
    this.free = size;
  }

  /** Trả về hàm `release` (gọi nhiều lần vẫn chỉ nhả một lần). */
  acquire(waitMs: number): Promise<() => void> {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) next(); // chuyển thẳng chỗ cho người chờ lâu nhất
      else this.free++;
    };

    if (this.free > 0) {
      this.free--;
      return Promise.resolve(release);
    }
    const { promise, resolve, reject } = Promise.withResolvers<() => void>();
    const grant = () => {
      clearTimeout(timer);
      resolve(release);
    };
    const timer = setTimeout(() => {
      this.waiters.splice(this.waiters.indexOf(grant), 1);
      reject(new HttpError('Máy chủ đang bận, thử lại sau ít phút', 503));
    }, waitMs);
    this.waiters.push(grant);
    return promise;
  }
}
