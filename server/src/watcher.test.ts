import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPayload, tick, type PushPayload, type SendResult } from './watcher.js';
import { WatchStore, type PushSub } from './watches.js';

const NOW = Date.parse('2026-11-20T00:00:00Z');
const sub = (n = 1): PushSub => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'p', auth: 'a' } });

/** `freeCount` sân trống (từ sân 1) ở mọi cột. */
const gridWith = (freeCount: number): boolean[][] =>
  Array.from({ length: 10 }, (_, i) => Array<boolean>(38).fill(i < freeCount));

describe('buildPayload', () => {
  const w = { id: 'w1', date: '2026-11-22', start: '18:00', end: '20:00' };

  it('tiêu đề có khung giờ, thứ và ngày', () => {
    expect(buildPayload(w, 'low', [4, 6]).title).toBe('Sân 18:00–20:00 CN (22/11)');
  });

  it('nội dung theo sự kiện', () => {
    expect(buildPayload(w, 'low', [4, 6]).body).toBe('Chỉ còn 2 sân: 4, 6');
    expect(buildPayload(w, 'soldout', []).body).toBe('Đã hết sân trống');
    expect(buildPayload(w, 'back', [3]).body).toBe('Có sân trống lại: sân 3');
  });

  it('url điền sẵn khung giờ, tag là id theo dõi', () => {
    const p = buildPayload(w, 'low', [1]);
    expect(p.url).toBe('./?dat-san&dat=2026-11-22&tu=18%3A00&den=20%3A00');
    expect(p.tag).toBe('w1');
  });
});

describe('tick', () => {
  let dir: string;
  let store: WatchStore;
  let sent: { sub: PushSub; payload: PushPayload }[];
  let freeCount: number;
  let reads: string[];
  let sendResult: SendResult | Error;
  let goneEndpoint: string | null;

  const run = () =>
    tick({
      store,
      now: () => NOW,
      log: () => {},
      getFree: async (date) => {
        reads.push(date);
        return gridWith(freeCount);
      },
      send: async (s, payload) => {
        if (sendResult instanceof Error) throw sendResult;
        if (s.endpoint === goneEndpoint) return 'gone';
        sent.push({ sub: s, payload });
        return sendResult;
      },
    });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'watcher-'));
    store = new WatchStore(dir);
    sent = [];
    reads = [];
    freeCount = 6;
    sendResult = 'ok';
    goneEndpoint = null;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lần đầu chỉ ghi mốc, lần sau xuống ngưỡng mới báo một lần', async () => {
    store.add(sub(), '2026-11-22', '18:00', '20:00', 2);
    await run();
    expect(sent).toHaveLength(0);
    expect(store.all()[0].state).toBe('many');

    freeCount = 2;
    await run();
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.body).toBe('Chỉ còn 2 sân: 1, 2');

    await run(); // vẫn 2 sân: không báo lại
    expect(sent).toHaveLength(1);
  });

  it('mốc đã gán lúc tạo thì lượt kiểm tra đầu tiên vẫn báo khi sân đã giảm', async () => {
    const w = store.add(sub(), '2026-11-22', '18:00', '20:00', 2);
    store.seedState(w.id, 'many'); // như khi tạo theo dõi lúc còn nhiều sân
    freeCount = 2;
    await run();
    expect(sent).toHaveLength(1);
    expect(sent[0].payload.body).toBe('Chỉ còn 2 sân: 1, 2');
  });

  it('báo hết sân rồi báo có sân lại', async () => {
    store.add(sub(), '2026-11-22', '18:00', '20:00', 2);
    await run();
    freeCount = 0;
    await run();
    freeCount = 1;
    await run();
    expect(sent.map((s) => s.payload.body)).toEqual(['Đã hết sân trống', 'Có sân trống lại: sân 1']);
  });

  it('các khung cùng ngày chỉ đọc lịch một lần', async () => {
    store.add(sub(1), '2026-11-22', '18:00', '20:00', 2);
    store.add(sub(2), '2026-11-22', '08:00', '09:00', 2);
    store.add(sub(1), '2026-11-23', '18:00', '20:00', 2);
    await run();
    expect(reads.sort()).toEqual(['2026-11-22', '2026-11-23']);
  });

  it('xoá theo dõi đã qua giờ bắt đầu và không đọc lịch cho nó', async () => {
    store.add(sub(), '2026-11-19', '08:00', '09:00', 2);
    await run();
    expect(store.all()).toHaveLength(0);
    expect(reads).toHaveLength(0);
  });

  it('thiết bị đã huỷ đăng ký (gone) thì bỏ mọi theo dõi của nó', async () => {
    store.add(sub(1), '2026-11-22', '18:00', '20:00', 2);
    store.add(sub(1), '2026-11-22', '08:00', '09:00', 2);
    store.add(sub(2), '2026-11-22', '18:00', '20:00', 2);
    await run();
    freeCount = 1;
    goneEndpoint = sub(1).endpoint;
    await run();
    expect(store.all().map((w) => w.subscription.endpoint)).toEqual([sub(2).endpoint]);
    expect(sent.map((s) => s.sub.endpoint)).toEqual([sub(2).endpoint]);
  });

  it('gửi lỗi tạm thời thì giữ trạng thái cũ để lượt sau báo lại', async () => {
    store.add(sub(), '2026-11-22', '18:00', '20:00', 2);
    await run();
    freeCount = 1;
    sendResult = new Error('mạng lỗi');
    await run();
    expect(store.all()[0].state).toBe('many');

    sendResult = 'ok';
    await run();
    expect(sent).toHaveLength(1);
    expect(store.all()[0].state).toBe('few');
  });

  it('lỗi đọc lịch một ngày không chặn các ngày khác', async () => {
    store.add(sub(), '2026-11-22', '18:00', '20:00', 2);
    store.add(sub(), '2026-11-23', '18:00', '20:00', 2);
    await tick({
      store,
      now: () => NOW,
      log: () => {},
      getFree: async (date) => {
        if (date === '2026-11-22') throw new Error('Alobo lỗi');
        return gridWith(6);
      },
      send: async () => 'ok',
    });
    expect(store.all().find((w) => w.date === '2026-11-23')?.state).toBe('many');
    expect(store.all().find((w) => w.date === '2026-11-22')?.state).toBe('unknown');
  });
});
