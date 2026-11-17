import { classify, freeCourtList, transition, type PushSub, type Watch, type WatchEvent, type WatchStore } from './watches.js';

export interface PushPayload {
  title: string;
  body: string;
  /** Cùng tag thì thông báo mới thay thông báo cũ của khung đó. */
  tag: string;
  /** Đường dẫn tương đối với app; bấm thông báo thì mở app với khung này điền sẵn. */
  url: string;
}

export type SendResult = 'ok' | 'gone';

const DOW = ['CN', 'thứ 2', 'thứ 3', 'thứ 4', 'thứ 5', 'thứ 6', 'thứ 7'];

export function buildPayload(w: Pick<Watch, 'id' | 'date' | 'start' | 'end'>, event: WatchEvent, courts: number[]): PushPayload {
  const [y, m, d] = w.date.split('-').map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const list = courts.join(', ');
  const body =
    event === 'soldout'
      ? 'Đã hết sân trống'
      : event === 'back'
        ? `Có sân trống lại: sân ${list}`
        : `Chỉ còn ${courts.length} sân: ${list}`;
  // `dat-san` mở màn đặt sân (xem app.tsx); dat/tu/den điền sẵn form và tự kiểm tra sân trống.
  const q = new URLSearchParams({ dat: w.date, tu: w.start, den: w.end });
  return {
    title: `Sân ${w.start}–${w.end} ${dow} (${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')})`,
    body,
    tag: w.id,
    url: `./?dat-san&${q}`,
  };
}

export interface TickDeps {
  store: WatchStore;
  /** Lưới trống của một ngày: `free[sân - 1][cột]`. */
  getFree(date: string): Promise<boolean[][]>;
  send(sub: PushSub, payload: PushPayload): Promise<SendResult>;
  now?: () => number;
  log?: (msg: string) => void;
}

/** Một lượt kiểm tra: mỗi ngày có người theo dõi đọc lịch một lần rồi so với trạng thái đã lưu của từng khung. */
export async function tick({ store, getFree, send, now = Date.now, log = console.log }: TickDeps): Promise<void> {
  store.purgeExpired(now());
  const byDate = new Map<string, Watch[]>();
  for (const w of store.all()) byDate.set(w.date, [...(byDate.get(w.date) ?? []), w]);

  const gone = new Set<string>();
  for (const [date, watches] of byDate) {
    let free: boolean[][];
    try {
      free = await getFree(date);
    } catch (e) {
      log(`watch: không đọc được lịch ${date}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const w of watches) {
      if (gone.has(w.subscription.endpoint)) continue;
      const courts = freeCourtList(free, w.start, w.end);
      const next = classify(courts.length, w.threshold);
      const event = transition(w.state, next);
      if (!event) {
        store.setState(w.id, next);
        continue;
      }
      try {
        if ((await send(w.subscription, buildPayload(w, event, courts))) === 'gone') {
          gone.add(w.subscription.endpoint);
          store.removeEndpoint(w.subscription.endpoint);
          continue;
        }
        store.setState(w.id, next);
      } catch (e) {
        // Lỗi tạm thời: giữ trạng thái cũ để lượt sau thử báo lại.
        log(`watch: gửi thông báo lỗi: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}

/** Chạy `tick` mỗi `intervalMs`, không chồng lượt; trả hàm dừng. */
export function startWatcher(deps: TickDeps, intervalMs: number): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    tick(deps)
      .catch((e) => console.error('watch tick', e))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
