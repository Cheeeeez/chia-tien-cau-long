import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { BrowserContext, Page } from 'playwright';
import { matchesAccessCode } from './access.js';
import { AccountStore } from './accounts.js';
import { confirm, closeBrowser, login, prepare, submitPayment, type Prepared } from './alobo/flow.js';
import { config } from './config.js';
import { HttpError, SessionExpiredError } from './errors.js';
import { MAX_IMAGE_BYTES, decodeImage } from './image.js';
import { normalizePhone, validateIntent, validateName, vnToday, type BookingIntent } from './intent.js';
import { parseCommand } from './llm.js';
import { Pool } from './pool.js';
import { FailureLimiter } from './ratelimit.js';

const accounts = new AccountStore(config.dataDir, config.secretKey);
const pool = new Pool(config.maxSessions);
const loginFailures = new FailureLimiter(5, 15 * 60_000);
// Mã truy cập có thể ngắn nên phải chặn đoán mò: 10 lần sai trong 15 phút thì khoá IP đó.
const accessFailures = new FailureLimiter(10, 15 * 60_000);

const TTL_MS = 5 * 60 * 1000;
const SLOT_WAIT_MS = 45_000; // chờ tối đa bao lâu để có chỗ chạy trình duyệt
const MAX_BODY = 10 * 1024;
const MAX_IMAGE_BODY = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024; // base64 + vỏ JSON

/** Một lượt đặt đang mở trình duyệt. */
interface Session {
  id: string;
  /** Tài khoản: SĐT 9 chữ số. Khách: `guest:<sđt>` (chỉ để mỗi người một lượt một lúc). */
  owner: string;
  /** Khách truy cập lượt đặt chỉ bằng `id` (UUID khó đoán); tài khoản phải đúng chủ. */
  guest: boolean;
  /** `summary`: chờ người dùng xác nhận; `payment`: đơn đã tạo, chờ ảnh chuyển khoản (Alobo giữ chỗ vài phút). */
  stage: 'summary' | 'payment';
  paying: boolean;
  context: BrowserContext;
  page: Page;
  expiresAt: number;
  timer: NodeJS.Timeout;
  /** Trả chỗ trong `pool` khi đóng. */
  release: () => void;
}

const sessions = new Map<string, Session>();
const starting = new Set<string>(); // SĐT đang chuẩn bị, chưa có Session

const sessionOf = (phone: string) => [...sessions.values()].find((s) => s.owner === phone);

async function closeSession(s: Session): Promise<void> {
  if (!sessions.delete(s.id)) return;
  clearTimeout(s.timer);
  await s.context.close().catch(() => {});
  s.release();
}

function armExpiry(s: Session, ms: number): void {
  clearTimeout(s.timer);
  s.expiresAt = Date.now() + ms;
  s.timer = setTimeout(() => void closeSession(s), ms);
}

/** Đơn đã tạo: giữ trang thanh toán đến hết thời gian Alobo giữ chỗ (bớt 5 giây dự phòng). */
function holdForPayment(s: Session, holdSeconds: number | null): void {
  s.stage = 'payment';
  armExpiry(s, Math.max(30_000, (holdSeconds ?? 300) * 1000 - 5000));
}

interface Account {
  phone: string;
  /** Mã thiết bị (chưa băm) gửi lên trong header. */
  token: string;
}

type Caller = ({ kind: 'account' } & Account) | { kind: 'guest' };

/** Header `Authorization: Bearer <sđt9>:<mã thiết bị>` do `POST /accounts` cấp sau khi đăng nhập Alobo đúng. */
function authenticate(req: IncomingMessage): Account {
  const m = /^Bearer (\d{9}):([0-9a-f]{64})$/.exec(req.headers.authorization ?? '');
  if (!m || (config.allowedPhones && !config.allowedPhones.has(m[1])) || !accounts.hasDevice(m[1], m[2])) {
    throw new HttpError('Chưa đăng nhập hoặc phiên đã hết hạn', 401);
  }
  return { phone: m[1], token: m[2] };
}

/** Có header Authorization thì phải hợp lệ (không thì 401); không có thì là khách, chỉ cần mã truy cập. */
function identify(req: IncomingMessage): Caller {
  return req.headers.authorization ? { kind: 'account', ...authenticate(req) } : { kind: 'guest' };
}

function assertPhoneAllowed(phone: string): void {
  if (config.allowedPhones && !config.allowedPhones.has(phone)) {
    throw new HttpError('Số này chưa được phép dùng máy chủ, hãy nhờ quản trị viên thêm vào', 403);
  }
}

/** IP người gọi để giới hạn thử sai; sau tunnel/reverse proxy thì lấy từ header của proxy (cần TRUST_PROXY=1). */
function clientIp(req: IncomingMessage): string {
  if (config.trustProxy) {
    const h = req.headers['cf-connecting-ip'] ?? req.headers['x-forwarded-for'];
    const first = (Array.isArray(h) ? h[0] : h)?.split(',')[0].trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

async function readJson(req: IncomingMessage, max = MAX_BODY): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > max) throw new HttpError('Dữ liệu gửi lên quá lớn', 413);
    chunks.push(c as Buffer);
  }
  try {
    const v: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    // rơi xuống lỗi chung
  }
  throw new HttpError('Dữ liệu gửi lên không hợp lệ', 400);
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
}

function reply(res: ServerResponse, status: number, body?: unknown): number {
  send(res, status, body);
  return status;
}

/** Đặt bằng tài khoản đã lưu của SĐT; phiên Alobo hết hạn thì tự đăng nhập lại bằng mật khẩu đã lưu. */
async function prepareFor(phone: string, intent: BookingIntent): Promise<Prepared> {
  const saved = accounts.load(phone);
  if (!saved) throw new SessionExpiredError();

  let p: Prepared;
  try {
    p = await prepare(intent, { kind: 'account', state: saved.state });
  } catch (e) {
    if (!(e instanceof SessionExpiredError) || !saved.password) throw e;
    const state = await login(phone, saved.password);
    accounts.saveLogin(phone, state, saved.password);
    p = await prepare(intent, { kind: 'account', state });
  }
  if (p.state) accounts.saveState(phone, p.state); // token có thể đã được Alobo làm mới
  return p;
}

async function createBooking(caller: Caller, body: Record<string, unknown>) {
  // Khách tự nhập tên + SĐT (Alobo từ chối nếu số đó đã có tài khoản); tài khoản thì Alobo tự điền.
  let owner: string;
  let guest: { name: string; phone9: string } | null = null;
  if (caller.kind === 'account') {
    owner = caller.phone;
  } else {
    guest = { name: validateName(body.name), phone9: normalizePhone(String(body.phone ?? '')) };
    assertPhoneAllowed(guest.phone9);
    owner = `guest:${guest.phone9}`;
  }
  if (sessionOf(owner) || starting.has(owner)) {
    throw new HttpError('Bạn đang có một lượt đặt chưa xong, hãy xác nhận hoặc huỷ trước', 409);
  }
  starting.add(owner);
  try {
    const today = vnToday();
    const intent = validateIntent(typeof body.command === 'string' ? await parseCommand(body.command, today) : body, today);

    const release = await pool.acquire(SLOT_WAIT_MS);
    let p: Prepared;
    try {
      p = guest ? await prepare(intent, { kind: 'guest', ...guest }) : await prepareFor(owner, intent);
    } catch (e) {
      release();
      throw e;
    }
    const id = randomUUID();
    const s: Session = {
      id,
      owner,
      guest: guest !== null,
      stage: 'summary',
      paying: false,
      context: p.context,
      page: p.page,
      expiresAt: Date.now() + TTL_MS,
      timer: setTimeout(() => void closeSession(s), TTL_MS),
      release,
    };
    sessions.set(id, s);
    return { id, intent: { ...intent, court: p.court }, summary: p.summary, screenshot: p.screenshot, expiresAt: s.expiresAt };
  } finally {
    starting.delete(owner);
  }
}

/** Đăng nhập Alobo bằng SĐT + mật khẩu; đúng thì lưu tài khoản và cấp mã cho thiết bị này. */
async function signIn(body: Record<string, unknown>) {
  const phone = normalizePhone(String(body.phone ?? ''));
  assertPhoneAllowed(phone);
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 1 || password.length > 100) throw new HttpError('Mật khẩu không hợp lệ', 400);
  loginFailures.check(phone);

  const release = await pool.acquire(SLOT_WAIT_MS);
  try {
    const state = await login(phone, password);
    loginFailures.reset(phone);
    accounts.saveLogin(phone, state, password);
  } catch (e) {
    if (e instanceof HttpError && e.status === 401) loginFailures.fail(phone);
    throw e;
  } finally {
    release();
  }
  return { phone, session: `${phone}:${accounts.addDevice(phone)}` };
}

async function route(req: IncomingMessage, res: ServerResponse, path: string): Promise<number> {
  const method = req.method ?? 'GET';
  if (method === 'GET' && path === '/health') return reply(res, 200, { ok: true });
  // Mã truy cập chung của nhóm: mọi lệnh khác đều phải kèm, trước cả đăng nhập Alobo.
  const ip = clientIp(req);
  accessFailures.check(ip);
  if (!matchesAccessCode(req.headers['x-access-code'], config.accessCode)) {
    accessFailures.fail(ip);
    throw new HttpError('Sai mã truy cập', 403);
  }
  if (method === 'POST' && path === '/accounts') return reply(res, 200, await signIn(await readJson(req)));

  const caller = identify(req);

  // Các lệnh về tài khoản chỉ dành cho người đã đăng nhập Alobo.
  if (path === '/account' || path === '/account/logout') {
    if (caller.kind !== 'account') throw new HttpError('Chưa đăng nhập hoặc phiên đã hết hạn', 401);
    if (method === 'GET' && path === '/account') {
      return reply(res, 200, { phone: caller.phone, updatedAt: accounts.load(caller.phone)?.updatedAt ?? null });
    }
    if (method === 'POST' && path === '/account/logout') {
      accounts.removeDevice(caller.phone, caller.token);
      return reply(res, 204);
    }
  }
  if (method === 'DELETE' && path === '/account') {
    if (caller.kind !== 'account') throw new HttpError('Chưa đăng nhập hoặc phiên đã hết hạn', 401);
    const mine = sessionOf(caller.phone);
    if (mine) await closeSession(mine);
    accounts.remove(caller.phone); // xoá phiên, mật khẩu và mọi thiết bị
    return reply(res, 204);
  }

  if (method === 'POST' && path === '/bookings') return reply(res, 200, await createBooking(caller, await readJson(req)));

  const m = /^\/bookings\/([^/]+)(?:\/(confirm|payment))?$/.exec(path);
  if (!m) throw new HttpError('Không tìm thấy', 404);
  const s = sessions.get(m[1]);
  const owned = s && (caller.kind === 'account' ? !s.guest && s.owner === caller.phone : s.guest) ? s : undefined;

  if (method === 'DELETE' && !m[2]) {
    if (owned) await closeSession(owned);
    return reply(res, 204);
  }
  if (method === 'POST' && m[2] === 'confirm') {
    if (!owned) throw new HttpError('Lượt đặt không tồn tại hoặc đã hết hạn', 404);
    if (owned.stage !== 'summary') throw new HttpError('Lượt đặt này đã được xác nhận', 409);
    let result;
    try {
      result = await confirm(owned.page);
    } catch (e) {
      await closeSession(owned);
      throw e;
    }
    // Đơn đã tạo thì giữ trang thanh toán để còn gửi ảnh chuyển khoản; không thì đóng.
    if (result.payment) holdForPayment(owned, result.payment.holdSeconds);
    else await closeSession(owned);
    return reply(res, 200, { ...result, expiresAt: result.payment ? owned.expiresAt : null });
  }
  if (method === 'POST' && m[2] === 'payment') {
    const body = await readJson(req, MAX_IMAGE_BODY);
    if (!owned) throw new HttpError('Lượt đặt không tồn tại hoặc đã hết hạn', 404);
    if (owned.stage !== 'payment') throw new HttpError('Chưa xác nhận đơn nên chưa gửi được ảnh thanh toán', 409);
    if (owned.paying) throw new HttpError('Đang gửi ảnh thanh toán', 409);
    const image = decodeImage(body.image);
    owned.paying = true;
    try {
      const paid = await submitPayment(owned.page, image.buffer, image.fileName);
      await closeSession(owned); // lỗi ở trên thì giữ phiên để còn thử lại trong thời gian giữ chỗ
      return reply(res, 200, paid);
    } finally {
      owned.paying = false;
    }
  }
  throw new HttpError('Không tìm thấy', 404);
}

const server = createServer(async (req, res) => {
  const t0 = Date.now();
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  let status: number;
  try {
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Access-Code');
      res.setHeader('Access-Control-Max-Age', '600');
      status = reply(res, 204);
    } else {
      status = await route(req, res, path);
    }
  } catch (e) {
    if (e instanceof HttpError) {
      status = reply(res, e.status, e.screenshot ? { error: e.message, screenshot: e.screenshot } : { error: e.message });
    } else {
      console.error(e);
      status = reply(res, 500, { error: 'Lỗi máy chủ' });
    }
  }
  console.log(`${req.method} ${path} ${status} ${Date.now() - t0}ms`);
});

server.listen(config.port, () =>
  console.log(
    `dat-san-agent nghe ở cổng ${config.port}, ${config.allowedPhones ? `${config.allowedPhones.size} số được phép` : 'mọi số'}, tối đa ${config.maxSessions} phiên song song`,
  ),
);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    void Promise.all([...sessions.values()].map(closeSession))
      .then(closeBrowser)
      .finally(() => process.exit(0));
  });
}
