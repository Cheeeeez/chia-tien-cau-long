import { describe, expect, it } from 'vitest';
import { Pool } from './pool.js';

describe('Pool', () => {
  it('hết chỗ thì người sau chờ, có người nhả thì được vào theo thứ tự', async () => {
    const pool = new Pool(1);
    const r1 = await pool.acquire(1000);
    const order: string[] = [];
    const p2 = pool.acquire(1000).then((r) => (order.push('b'), r));
    const p3 = pool.acquire(1000).then((r) => (order.push('c'), r));
    r1();
    (await p2)();
    (await p3)();
    expect(order).toEqual(['b', 'c']);
  });

  it('chờ quá hạn thì báo bận 503 và không mất chỗ của người khác', async () => {
    const pool = new Pool(1);
    const r1 = await pool.acquire(1000);
    await expect(pool.acquire(20)).rejects.toMatchObject({ status: 503 });
    r1();
    // chỗ vẫn trả lại đúng một lần dù người chờ đã bỏ cuộc
    const r2 = await pool.acquire(20);
    await expect(pool.acquire(20)).rejects.toMatchObject({ status: 503 });
    r2();
  });

  it('gọi release nhiều lần chỉ nhả một chỗ', async () => {
    const pool = new Pool(1);
    const r1 = await pool.acquire(1000);
    r1();
    r1();
    const r2 = await pool.acquire(1000);
    await expect(pool.acquire(20)).rejects.toMatchObject({ status: 503 });
    r2();
  });
});
