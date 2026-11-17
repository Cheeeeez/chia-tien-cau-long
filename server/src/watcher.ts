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

export type EvalDeps = Pick<TickDeps, 'store' | 'send' | 'log'>;

// Cùng một theo dõi không được đánh giá song song (vd. vừa tạo xong thì tick cũng tới), kẻo báo hai lần.
const evaluating = new Set<string>();

/**
 * Đối chiếu một theo dõi với lưới `free` vừa đọc: gửi thông báo nếu trạng thái đổi (hoặc lần đầu mà đã còn ít sân), rồi lưu trạng thái.
 * Trả `'gone'` khi thiết bị đã huỷ đăng ký (mọi theo dõi của nó đã bị xoá).
 */
export async function evaluate(id: string, free: boolean[][], { store, send, log = console.log }: EvalDeps): Promise<SendResult> {
  if (evaluating.has(id)) return 'ok';
  const w = store.get(id); // đọc lại: có thể đã đổi hoặc bị xoá từ lúc lấy danh sách
  if (!w) return 'ok';
  evaluating.add(id);
  try {
    const courts = freeCourtList(free, w.start, w.end);
    const next = classify(courts.length, w.threshold);
    const event = transition(w.state, next);
    if (!event) {
      store.setState(id, next);
      return 'ok';
    }
    try {
      if ((await send(w.subscription, buildPayload(w, event, courts))) === 'gone') {
        store.removeEndpoint(w.subscription.endpoint);
        return 'gone';
      }
      store.setState(id, next);
    } catch (e) {
      // Lỗi tạm thời: giữ trạng thái cũ để lượt sau thử báo lại.
      log(`watch: gửi thông báo lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
    return 'ok';
  } finally {
    evaluating.delete(id);
  }
}

/** Một lượt kiểm tra: mỗi ngày có người theo dõi đọc lịch một lần rồi đối chiếu từng khung của ngày đó. */
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
      if ((await evaluate(w.id, free, { store, send, log })) === 'gone') gone.add(w.subscription.endpoint);
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
