import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { StorageState } from '../accounts.js';
import { HttpError, SessionExpiredError } from '../errors.js';
import { vnToday, type BookingIntent } from '../intent.js';
import { BRANCH_URL, COLOR, COURTS, COURT_PRIORITY, GRID, PT, USER_AGENT, VIEWPORT, cellCenter, pickerTarget, slotColumns, type Point } from './layout.js';
import { Shot, gridColumnWidth, isFree, isSelected, near } from './pixels.js';
import { cropQr } from './qr.js';
import { diffSummary, parseSummary, type Summary } from './summary.js';

// Chromium ngốn vài trăm MB RAM nên chỉ giữ khi đang có phiên; rảnh quá BROWSER_IDLE_MS thì đóng, lần sau tự mở lại (~1 giây).
const BROWSER_IDLE_MS = 60_000;
let browser: Browser | null = null;
let openContexts = 0;
let idleTimer: NodeJS.Timeout | undefined;

function cancelIdleClose(): void {
  clearTimeout(idleTimer);
  idleTimer = undefined;
}

function armIdleClose(): void {
  cancelIdleClose();
  if (openContexts > 0) return;
  idleTimer = setTimeout(() => {
    if (openContexts === 0) void closeBrowser();
  }, BROWSER_IDLE_MS);
}

async function getBrowser(): Promise<Browser> {
  cancelIdleClose();
  if (!browser || !browser.isConnected()) browser = await chromium.launch({ headless: true });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  cancelIdleClose();
  await browser?.close().catch(() => {});
  browser = null;
}

const dmy = (d: string) => d.split('-').reverse().join('/');

const ENABLE_SEMANTICS = `(() => {
  document.querySelector('flt-semantics-placeholder').click();
  const s = document.createElement('style');
  s.textContent = 'flt-semantics, flt-semantics-container { pointer-events: none !important; }';
  document.head.appendChild(s);
})()`;

const READ_TEXTS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('flt-semantics')) {
    const l = (el.getAttribute('aria-label') || '').trim();
    if (l) out.push(l);
  }
  for (const el of document.querySelectorAll('flt-semantics span')) {
    const t = (el.textContent || '').trim();
    if (t) out.push(t);
  }
  return out;
})()`;

const jpeg = async (page: Page) => 'data:image/jpeg;base64,' + (await page.screenshot({ type: 'jpeg', quality: 70 })).toString('base64');
const shot = async (page: Page) => new Shot(await page.screenshot({ type: 'png' }));

async function waitColor(page: Page, pt: Point, hex: string, ms: number, msg: string): Promise<void> {
  const deadline = Date.now() + ms;
  for (;;) {
    if (near((await shot(page)).rgb(pt.x, pt.y), hex)) return;
    if (Date.now() >= deadline) throw new HttpError(msg, 502, await jpeg(page));
    await page.waitForTimeout(300);
  }
}

const click = (page: Page, pt: Point) => page.mouse.click(pt.x, pt.y);
const readTexts = (page: Page) => page.evaluate(READ_TEXTS) as Promise<string[]>;

/** Flutter đôi khi không nhận click dù trang đã vẽ xong và bấm lại cũng vô ích (lần tải đó bị kẹt): tải lại trang sân. */
async function reloadBranch(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'load', timeout: 45000 });
  await waitColor(page, PT.datLich, COLOR.branchReady, 30000, 'Trang Alobo không tải xong');
  await page.waitForTimeout(1500);
}

export interface Prepared {
  context: BrowserContext;
  page: Page;
  court: number;
  summary: Summary;
  screenshot: string;
  /** Phiên Alobo sau khi dùng (token có thể đã được làm mới) để lưu lại; chỉ có khi đặt bằng tài khoản. */
  state?: StorageState;
}

export type Booker = { kind: 'guest'; name: string; phone9: string } | { kind: 'account'; state: StorageState };

async function newContext(state?: StorageState): Promise<BrowserContext> {
  try {
    const context = await (await getBrowser()).newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
      userAgent: USER_AGENT,
      storageState: state,
    });
    openContexts++;
    context.on('close', () => {
      openContexts--;
      armIdleClose();
    });
    return context;
  } catch (e) {
    armIdleClose();
    throw e;
  }
}

/**
 * Đăng nhập Alobo bằng SĐT + mật khẩu và trả về phiên (localStorage + IndexedDB; thiếu IndexedDB thì app coi như chưa đăng nhập).
 * `phone9`: 9 chữ số không có số 0 đầu.
 */
export async function login(phone9: string, password: string): Promise<StorageState> {
  const context = await newContext();
  try {
    const page = await context.newPage();
    await page.goto(BRANCH_URL, { waitUntil: 'load', timeout: 45000 });
    await waitColor(page, PT.datLich, COLOR.branchReady, 30000, 'Trang Alobo không tải xong');
    await page.waitForTimeout(1500);

    // Tab Tài khoản hiện hộp thoại "Tạo tài khoản"; bấm OK sang trang Đăng ký (nền trắng ở modalOk).
    // Flutter có thể chưa nhận click ngay sau khi vẽ xong trang nên bấm lại đến khi màn hình đổi (tại modalOk) mới đi tiếp.
    const idle = (await shot(page)).rgb(PT.modalOk.x, PT.modalOk.y);
    const idleHex = '#' + idle.map((v) => v.toString(16).padStart(2, '0')).join('');
    for (let attempt = 1; ; attempt++) {
      await click(page, PT.accountTab);
      await page.waitForTimeout(2500);
      if (!near((await shot(page)).rgb(PT.modalOk.x, PT.modalOk.y), idleHex, 12)) break;
      if (attempt >= 5) throw new HttpError('Không mở được màn đăng nhập Alobo', 502, await jpeg(page));
      if (attempt % 2 === 0) await reloadBranch(page); // bấm hai lần vẫn không ăn: lần tải này bị kẹt, tải lại
    }
    for (let attempt = 1; ; attempt++) {
      await click(page, PT.modalOk);
      await page.waitForTimeout(1500);
      if (near((await shot(page)).rgb(PT.modalOk.x, PT.modalOk.y), COLOR.free, 10)) break;
      if (attempt >= 3) throw new HttpError('Không mở được màn đăng nhập Alobo', 502, await jpeg(page));
    }
    await click(page, PT.loginLink);
    await waitColor(page, PT.loginButton, COLOR.loginButton, 10000, 'Không mở được màn đăng nhập Alobo');
    await page.waitForTimeout(500);

    await click(page, PT.loginPhone);
    await page.waitForTimeout(300);
    await page.keyboard.type(phone9, { delay: 30 });
    await click(page, PT.loginPassword);
    await page.waitForTimeout(300);
    await page.keyboard.type(password, { delay: 30 });
    await page.waitForTimeout(500);
    await click(page, PT.loginButton);

    let token: string | null = null;
    for (let i = 0; i < 30 && !token; i++) {
      await page.waitForTimeout(500);
      token = await page.evaluate(() => localStorage.getItem('flutter.access_token'));
    }
    if (!token) {
      await page.evaluate(ENABLE_SEMANTICS);
      await page.waitForTimeout(1000);
      const texts = await readTexts(page);
      const wrong = texts.some((t) => t.includes('không đúng'));
      throw new HttpError(wrong ? 'Số điện thoại hoặc mật khẩu Alobo không đúng' : 'Không đăng nhập được Alobo', wrong ? 401 : 502, await jpeg(page));
    }
    await page.waitForTimeout(3000); // để Alobo kịp ghi thông tin tài khoản vào IndexedDB
    const state = await context.storageState({ indexedDB: true });
    // typings của Playwright 1.64 chưa khai báo `indexedDB` trên kết quả, dù runtime có.
    const origins = state.origins as { indexedDB?: { name: string }[] }[];
    if (!origins.some((o) => o.indexedDB?.some((d) => d.name === 'localuseraccount'))) {
      throw new HttpError('Không lưu được phiên đăng nhập Alobo', 502, await jpeg(page));
    }
    return state;
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Đi tới trang tóm tắt của Alobo (dừng trước nút xác nhận).
 * Khách (`guest`): gõ tên + SĐT vào form. Tài khoản (`account`): dùng phiên đã lưu, Alobo tự điền tên/SĐT.
 */
export async function prepare(intent: BookingIntent, booker: Booker): Promise<Prepared> {
  const context = await newContext(booker.kind === 'account' ? booker.state : undefined);
  try {
    const page = await context.newPage();
    const probe = (pt: Point, hex: string, ms: number, msg: string) => waitColor(page, pt, hex, ms, msg);

    // 1. trang sân
    await page.goto(BRANCH_URL, { waitUntil: 'load', timeout: 45000 });
    await probe(PT.datLich, COLOR.branchReady, 30000, 'Trang Alobo không tải xong');

    // 2. dialog
    // Flutter có thể chưa nhận click ngay sau khi trang vừa vẽ xong nên thử lại vài lần.
    for (let attempt = 1; ; attempt++) {
      await click(page, PT.datLich);
      try {
        await probe(PT.card, COLOR.dialog, 4000, 'Không mở được hộp chọn hình thức đặt');
        break;
      } catch (e) {
        if (attempt >= 5) throw e;
        if (attempt % 2 === 0) await reloadBranch(page); // bấm hai lần vẫn không ăn: lần tải này bị kẹt, tải lại
      }
    }
    await page.waitForTimeout(700); // dialog còn đang animate: bấm sớm thì card không nhận

    // 3. bảng lịch
    const loaded = page.waitForResponse((r) => r.url().includes('/get_onetime_bookings?'), { timeout: 20000 });
    loaded.catch(() => {});
    await click(page, PT.card);
    try {
      await loaded;
      if (!page.url().endsWith('/userBooking')) throw new Error('url');
    } catch {
      throw new HttpError('Không mở được bảng lịch', 502, await jpeg(page));
    }
    await page.waitForTimeout(1000);

    // 4. chọn ngày
    const today = vnToday();
    if (intent.date !== today) {
      const target = pickerTarget(today, intent.date);
      await click(page, PT.dateButton);
      await page.waitForTimeout(1000);
      for (let i = 0; i < target.monthsAhead; i++) {
        await click(page, PT.nextMonth);
        await page.waitForTimeout(600);
      }
      const dated = page.waitForResponse(
        (r) => r.url().includes('get_onetime_bookings') && r.url().includes(`startDate=${intent.date}`),
        { timeout: 15000 },
      );
      dated.catch(() => {});
      await click(page, target);
      await page.waitForTimeout(300);
      await click(page, PT.pickerConfirm);
      try {
        await dated;
      } catch {
        throw new HttpError(`Không chọn được ngày ${dmy(intent.date)} trên Alobo`, 422, await jpeg(page));
      }
      await page.waitForTimeout(1000);
    }

    // 5. tìm sân trống rồi chọn ô. Pixel trống chưa đủ: Alobo có quy định khoảng cách giữa các ca nên có thể tự nới thêm
    // ô kế bên hoặc không nhận ô. Bấm lại ô đã chọn sẽ bỏ chọn, nên mỗi lần bấm đều xem lại trạng thái và chỉ bấm ô chưa chọn.
    // Hàng sân không đúng khung giờ yêu cầu thì bỏ chọn và thử sân kế tiếp.
    const before = await shot(page);
    const colW = gridColumnWidth(before, await jpeg(page));
    const cols = slotColumns(intent.start, intent.end);
    const candidates = intent.court ? [intent.court] : COURT_PRIORITY;
    const selectedCols = (s: Shot, c: number) =>
      Array.from({ length: GRID.cols }, (_, col) => col).filter((col) => {
        const p = cellCenter(col, c, colW);
        return isSelected(s.rgb(p.x, p.y));
      });
    const clearRow = async (c: number) => {
      for (let i = 0; i < GRID.cols; i++) {
        const sel = selectedCols(await shot(page), c);
        if (sel.length === 0) return;
        await click(page, cellCenter(sel[0], c, colW));
        await page.waitForTimeout(400);
      }
      throw new HttpError('Không bỏ chọn được ô trên bảng lịch', 502, await jpeg(page));
    };

    let court: number | undefined;
    let anyFree = false;
    for (const c of candidates) {
      const free = cols.every((col) => {
        const p = cellCenter(col, c, colW);
        return isFree(before.rgb(p.x, p.y));
      });
      if (!free) continue;
      anyFree = true;
      let sel = selectedCols(await shot(page), c);
      for (const col of cols) {
        if (sel.includes(col)) continue;
        await click(page, cellCenter(col, c, colW));
        await page.waitForTimeout(400);
        sel = selectedCols(await shot(page), c);
      }
      if (sel.length === cols.length && cols.every((col) => sel.includes(col))) {
        court = c;
        break;
      }
      console.log(`Sân ${c}: trống nhưng Alobo chọn cột [${sel}] thay vì [${cols}], bỏ qua`);
      await clearRow(c);
    }
    if (!court) {
      const range = `${intent.start}–${intent.end} ngày ${dmy(intent.date)}`;
      const which = intent.court ? `Sân C.Lông ${intent.court}` : 'Các sân còn trống';
      throw new HttpError(
        anyFree
          ? `${which} không đặt đúng được khung ${range} (Alobo tự đổi khung giờ theo quy định khoảng cách giữa các ca)`
          : intent.court
            ? `Sân C.Lông ${intent.court} không trống ${range}`
            : `Không còn sân trống ${range}`,
        422,
        await jpeg(page),
      );
    }

    // 7. tiếp theo
    await click(page, PT.tiepTheo);
    await probe(PT.summaryProbe, COLOR.summary, 10000, 'Alobo không cho sang bước xác nhận (có thể vi phạm quy định khung giờ của sân)');

    // 8. gõ tên/SĐT (chỉ khách) — PHẢI trước khi bật semantics (bật rồi thì ô SĐT không nhận phím)
    if (booker.kind === 'guest') {
      await click(page, PT.nameField);
      await page.waitForTimeout(300);
      await page.keyboard.type(booker.name, { delay: 30 });
      await click(page, PT.phoneField);
      await page.waitForTimeout(300);
      await page.keyboard.type(booker.phone9, { delay: 30 });
      await page.waitForTimeout(500);
    }

    // 9. bật semantics, đối chiếu
    await page.evaluate(ENABLE_SEMANTICS);
    await page.waitForTimeout(1500);
    const texts = await readTexts(page);
    // Tài khoản đã lưu mà trang vẫn mời đăng nhập nghĩa là phiên không còn hiệu lực.
    if (booker.kind === 'account' && texts.some((t) => t.includes('Đăng nhập để có thể sử dụng ưu đãi'))) {
      throw new SessionExpiredError();
    }
    let summary: Summary;
    try {
      summary = parseSummary(texts);
    } catch (e) {
      console.error('Không parse được tóm tắt, texts =', JSON.stringify(texts));
      throw e;
    }
    const diff = diffSummary(summary, intent, COURTS[court - 1]);
    if (diff) throw new HttpError(`Alobo hiển thị khác yêu cầu: ${diff}`, 422, await jpeg(page));

    const screenshot = await jpeg(page);
    const fresh = booker.kind === 'account' ? await context.storageState({ indexedDB: true }) : undefined;
    return { context, page, court, summary, screenshot, state: fresh };
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
}

type RequestLog = { method: string; url: string; status: number }[];

/** Ghi lại các request ghi (POST/PUT/PATCH) tới alobo.vn, bỏ log phân tích. */
function recordWrites(page: Page): RequestLog {
  const requests: RequestLog = [];
  page.on('response', (r) => {
    const method = r.request().method();
    if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return;
    const url = new URL(r.url());
    if (!url.hostname.endsWith('alobo.vn') || url.pathname.includes('/log/')) return;
    requests.push({ method, url: r.url(), status: r.status() });
  });
  return requests;
}

/** Tâm của phần tử semantics có chữ (textContent hoặc aria-label) bắt đầu bằng `text`; null nếu không có. */
async function semanticsCenter(page: Page, text: string): Promise<Point | null> {
  return page.evaluate(
    (t) => {
      for (const el of document.querySelectorAll('flt-semantics')) {
        const s = (el.textContent || '').trim() || (el.getAttribute('aria-label') || '').trim();
        if (s.startsWith(t)) {
          const b = el.getBoundingClientRect();
          return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        }
      }
      return null;
    },
    text,
  );
}

export interface Payment {
  orderId: string | null;
  amount: number | null;
  /** Số giây Alobo còn giữ chỗ khi vào màn thanh toán. */
  holdSeconds: number | null;
  /** Ảnh PNG data URL chỉ gồm mã QR trên màn thanh toán; null khi không tìm thấy mã trong ảnh chụp. */
  qr: string | null;
  /** Nội dung chuyển khoản Alobo hiển thị ("Thanh toan online lich dat 4798"); null khi không thấy dòng này trong chữ đọc được. */
  note: string | null;
}

/** Bỏ dấu để khớp "Thanh toán online lịch đặt" lẫn "Thanh toan online lich dat". */
const stripMarks = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

/** Đọc nội dung chuyển khoản (dạng "Thanh toan online lich dat 4798") ở bất kỳ dòng nào trên màn thanh toán. */
export function parseTransferNote(texts: string[]): string | null {
  const m = /thanh toan[^\n\d]*?lich dat\s*(\d+)/i.exec(stripMarks(texts.join('\n')));
  return m ? `Thanh toan online lich dat ${m[1]}` : null;
}

/** Đọc mã đơn, số tiền, thời gian giữ chỗ từ màn "Thanh toán"; null nếu chưa phải màn đó. */
export function parsePayment(texts: string[]): Payment | null {
  if (!texts.some((t) => t.startsWith('Hình ảnh thanh toán'))) return null;
  const hold = texts.map((t) => /^(\d{2}):(\d{2})$/.exec(t)).find((m) => m);
  const amount = /chuyển khoản ([\d.]+)\s₫/.exec(texts.join('\n'));
  const orderAt = texts.indexOf('Mã đơn');
  return {
    orderId: orderAt >= 0 ? (texts[orderAt + 1] ?? null) : null,
    amount: amount ? Number(amount[1].replace(/\./g, '')) : null,
    holdSeconds: hold ? Number(hold[1]) * 60 + Number(hold[2]) : null,
    qr: null,
    note: parseTransferNote(texts),
  };
}

export interface Confirmed {
  status: 'submitted' | 'rejected' | 'unknown';
  texts: string[];
  requests: RequestLog;
  screenshot: string;
  /** Có khi Alobo đã tạo đơn và chuyển sang màn thanh toán (cần chuyển khoản rồi gửi ảnh). */
  payment: Payment | null;
}

function statusOf(requests: RequestLog, only?: RegExp): Confirmed['status'] {
  const rs = only ? requests.filter((r) => only.test(r.url)) : requests;
  if (rs.some((r) => r.status >= 200 && r.status < 300)) return 'submitted';
  return rs.some((r) => r.status >= 400) ? 'rejected' : 'unknown';
}

/** Bấm "XÁC NHẬN & THANH TOÁN" trên trang tóm tắt đã chuẩn bị. */
export async function confirm(page: Page): Promise<Confirmed> {
  const requests = recordWrites(page);
  const pt = await semanticsCenter(page, 'XÁC NHẬN & THANH TOÁN');
  if (!pt) throw new HttpError('Không thấy nút XÁC NHẬN & THANH TOÁN', 502, await jpeg(page));

  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(8000);
  const texts = await readTexts(page);
  const screenshot = await jpeg(page);
  const payment = parsePayment(texts);
  if (payment) payment.qr = cropQr(await page.screenshot({ type: 'png' }));

  // Alobo chặn đặt không đăng nhập nếu SĐT đã có tài khoản: hiện hộp thoại, không tạo đơn.
  const blocked = texts.some((t) => t.includes('đã có tài khoản'));
  const status = blocked ? 'rejected' : payment ? 'submitted' : statusOf(requests, /booking/i);
  return { status, texts, requests, screenshot, payment };
}

export interface Paid {
  status: Confirmed['status'];
  texts: string[];
  requests: RequestLog;
  screenshot: string;
}

/** Trên màn thanh toán: đính kèm ảnh chuyển khoản (`image`, tên `.png` hoặc `.jpg`) rồi bấm "Tiếp tục thanh toán". */
export async function submitPayment(page: Page, image: Buffer, fileName: string): Promise<Paid> {
  const requests = recordWrites(page);

  const zone = await semanticsCenter(page, 'Tải ảnh chuyển khoản');
  if (!zone) throw new HttpError('Không thấy ô tải ảnh chuyển khoản', 502, await jpeg(page));
  await page.mouse.click(zone.x, zone.y);
  await page.waitForTimeout(1500);
  const library = await semanticsCenter(page, 'Thư viện'); // hộp "Nguồn ảnh": Máy ảnh / Thư viện
  if (!library) throw new HttpError('Không thấy lựa chọn "Thư viện" của Alobo', 502, await jpeg(page));
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null),
    page.mouse.click(library.x, library.y),
  ]);
  if (!chooser) throw new HttpError('Alobo không mở hộp chọn tệp', 502, await jpeg(page));
  await chooser.setFiles({ name: fileName, mimeType: fileName.endsWith('.png') ? 'image/png' : 'image/jpeg', buffer: image });
  await page.waitForTimeout(3000);
  if (!(await readTexts(page)).some((t) => t.includes(fileName))) {
    throw new HttpError('Không đính kèm được ảnh thanh toán', 502, await jpeg(page));
  }

  const next = await semanticsCenter(page, 'Tiếp tục thanh toán');
  if (!next) throw new HttpError('Không thấy nút Tiếp tục thanh toán', 502, await jpeg(page));
  await page.mouse.click(next.x, next.y);
  await page.waitForTimeout(8000);
  return { status: statusOf(requests), texts: await readTexts(page), requests, screenshot: await jpeg(page) };
}
