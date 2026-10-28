import { useEffect, useState } from 'preact/hooks';
import {
  BOOKING_API_URL,
  BookingError,
  cancelBooking,
  checkSession,
  confirmBooking,
  deleteAccount,
  payBooking,
  prepareBooking,
  signIn,
  signOut,
  toPaymentImage,
  type Auth,
  type BookingRequest,
  type Confirmed,
  type Paid,
  type Prepared,
} from '../lib/booking';
import { formatVnd } from '../lib/money';
import { loadBookingSettings, saveBookingSettings } from '../lib/storage';
import { ShotViewer } from './ShotViewer';

type Phase = 'idle' | 'preparing' | 'prepared' | 'confirming' | 'done' | 'paying' | 'paid';

const p2 = (n: number) => String(n).padStart(2, '0');

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Các mốc giờ cách nhau 30 phút trong [from, to] (phút từ 00:00), dạng HH:MM. */
function slots(from: number, to: number): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m += 30) out.push(`${p2(Math.floor(m / 60))}:${p2(m % 60)}`);
  return out;
}

const START_SLOTS = slots(300, 1410);
const END_SLOTS = slots(330, 1440);
const COURTS = Array.from({ length: 10 }, (_, i) => i + 1);

const DONE_MESSAGE: Record<Confirmed['status'], string> = {
  submitted: 'Đã gửi đơn đặt sân. Làm theo hướng dẫn thanh toán trong ảnh.',
  rejected: 'Alobo từ chối đơn. Xem ảnh để biết lý do.',
  unknown: 'Chưa chắc đơn đã được tạo. Kiểm tra lại trên datlich.alobo.vn bằng số điện thoại đã nhập.',
};

export function Booking({ baseUrl }: { baseUrl: string }) {
  const [settings, setSettings] = useState(loadBookingSettings);
  const [mode, setMode] = useState<'command' | 'form'>('command');
  const [command, setCommand] = useState('');
  const [form, setForm] = useState({ date: today(), start: '19:00', end: '21:00', court: null as number | null });
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<BookingError | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [done, setDone] = useState<Confirmed | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [paid, setPaid] = useState<Paid | null>(null);
  const [now, setNow] = useState(Date.now());
  const [password, setPassword] = useState(''); // không lưu vào localStorage
  const [showCode, setShowCode] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<BookingError | null>(null);

  const { session, who } = settings;
  // Chế độ khách không gửi mã thiết bị dù máy này đã đăng nhập Alobo trước đó.
  const auth: Auth = who === 'account' ? settings : { code: settings.code, session: '' };
  useEffect(() => saveBookingSettings(settings), [settings]);

  // Đếm ngược thời gian giữ chỗ khi đang chờ ảnh chuyển khoản.
  useEffect(() => {
    if (phase !== 'done' && phase !== 'paying') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Mã thiết bị đã lưu có thể đã bị thu hồi (xoá tài khoản, đổi mật khẩu Alobo...): hỏi máy chủ khi mở màn.
  useEffect(() => {
    if (who !== 'account' || !session) return;
    checkSession(settings).catch((e) => {
      if (e instanceof BookingError && (e.status === 401 || e.status === 403)) dropLogin(e.status);
    });
  }, []);

  const busy = phase === 'preparing' || phase === 'confirming' || phase === 'paying';
  const hasCode = settings.code.trim() !== '';
  const identified = who === 'guest' ? settings.name.trim() !== '' && settings.phone.trim() !== '' : session !== '';
  const ready = hasCode && identified && (mode === 'form' || command.trim() !== '');

  const toError = (e: unknown) => (e instanceof BookingError ? e : new BookingError('Lỗi không xác định'));

  /** Bỏ đăng nhập hiện tại; 403 nghĩa là mã truy cập sai (quản trị viên đã đổi) nên xoá luôn để nhập lại. */
  function dropLogin(status?: number) {
    setSettings((s) => ({ ...s, session: '', code: status === 403 ? '' : s.code }));
  }

  /** Lỗi 401/403 giữa chừng nghĩa là mã thiết bị hoặc mã truy cập không còn hiệu lực: quay về màn đăng nhập. */
  function failure(e: unknown): BookingError {
    const err = toError(e);
    if (err.status === 401 || err.status === 403) {
      dropLogin(err.status);
      setLoginError(err);
    }
    return err;
  }

  async function login() {
    setLoginError(null);
    setSigningIn(true);
    try {
      const r = await signIn(settings.code.trim(), settings.phone, password);
      setSettings({ ...settings, phone: r.phone, session: r.session });
      setPassword('');
    } catch (e) {
      setLoginError(toError(e));
    } finally {
      setSigningIn(false);
    }
  }

  async function logout(forget: boolean) {
    try {
      await (forget ? deleteAccount(settings) : signOut(settings));
    } catch (e) {
      setLoginError(toError(e));
    }
    dropLogin();
    setPrepared(null);
    setPhase('idle');
  }

  async function prepare() {
    const req: BookingRequest = mode === 'command' ? { command: command.trim() } : form;
    setError(null);
    setPhase('preparing');
    try {
      setPrepared(await prepareBooking(auth, req, who === 'guest' ? { name: settings.name.trim(), phone: settings.phone } : undefined));
      setPhase('prepared');
    } catch (e) {
      setError(failure(e));
      setPhase('idle');
    }
  }

  async function confirm() {
    if (!prepared) return;
    setError(null);
    setPhase('confirming');
    try {
      setDone(await confirmBooking(auth, prepared.id));
      setPhase('done');
    } catch (e) {
      setError(failure(e));
      setPrepared(null); // phiên phía server đã đóng
      setPhase('idle');
    }
  }

  function cancel() {
    if (prepared) void cancelBooking(auth, prepared.id);
    setPrepared(null);
    setPhase('idle');
  }

  async function pay() {
    if (!prepared || !file) return;
    setError(null);
    setPhase('paying');
    try {
      const image = await toPaymentImage(file);
      setPaid(await payBooking(auth, prepared.id, image));
      setPhase('paid');
    } catch (e) {
      setError(failure(e));
      setPhase('done'); // máy chủ giữ phiên đến hết thời gian giữ chỗ nên còn thử lại được
    }
  }

  /** Thoát màn kết quả: đóng phiên còn mở ở máy chủ (đơn chưa chuyển khoản sẽ tự nhả chỗ khi hết hạn giữ chỗ). */
  function reset() {
    if (prepared) void cancelBooking(auth, prepared.id);
    setPrepared(null);
    setDone(null);
    setPaid(null);
    setFile(null);
    setPhase('idle');
  }

  const s = prepared?.summary;
  const expires = prepared ? new Date(prepared.expiresAt) : null;
  const secondsLeft = done?.expiresAt ? Math.max(0, Math.round((done.expiresAt - now) / 1000)) : 0;

  return (
    <main>
      <h1>🗓 Đặt sân Quốc Học – Từ Sơn</h1>
      <a href={baseUrl}>← Chia tiền</a>

      {!BOOKING_API_URL ? (
        <p class="error">Chưa cấu hình máy chủ đặt sân (VITE_BOOKING_API_URL).</p>
      ) : (
        <section>
          <h2>Người đặt</h2>
          <label class="field">
            <span>Mã truy cập</span>
            <div class="reveal">
              <input
                type={showCode ? 'text' : 'password'}
                autocomplete="off"
                autocapitalize="off"
                spellcheck={false}
                value={settings.code}
                onInput={(e) => setSettings({ ...settings, code: (e.target as HTMLInputElement).value })}
              />
              <button type="button" aria-pressed={showCode} aria-label={showCode ? 'Ẩn mã truy cập' : 'Hiện mã truy cập'} onClick={() => setShowCode((v) => !v)}>
                {showCode ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </label>
          <div class="segmented">
            <button type="button" class={who === 'guest' ? 'primary' : ''} disabled={busy} onClick={() => setSettings({ ...settings, who: 'guest' })}>
              Không cần tài khoản
            </button>
            <button type="button" class={who === 'account' ? 'primary' : ''} disabled={busy} onClick={() => setSettings({ ...settings, who: 'account' })}>
              Đăng nhập Alobo
            </button>
          </div>
          {who === 'guest' ? (
            <>
              <label class="field">
                <span>Tên</span>
                <input type="text" value={settings.name} onInput={(e) => setSettings({ ...settings, name: (e.target as HTMLInputElement).value })} />
              </label>
              <label class="field">
                <span>Số điện thoại</span>
                <input type="tel" value={settings.phone} onInput={(e) => setSettings({ ...settings, phone: (e.target as HTMLInputElement).value })} />
              </label>
              <p class="hint">Số điện thoại đã có tài khoản Alobo thì Alobo từ chối đặt không đăng nhập; khi đó hãy chọn "Đăng nhập Alobo".</p>
            </>
          ) : !session ? (
            <>
              <p class="hint">
                Dùng số điện thoại và mật khẩu tài khoản Alobo của bạn. Mật khẩu chỉ gửi tới máy chủ đặt sân và lưu mã hoá ở đó để tự đăng nhập
                lại, không lưu trên máy này.
              </p>
              <label class="field">
                <span>Số điện thoại</span>
                <input type="tel" value={settings.phone} onInput={(e) => setSettings({ ...settings, phone: (e.target as HTMLInputElement).value })} />
              </label>
              <label class="field">
                <span>Mật khẩu Alobo</span>
                <input type="password" autocomplete="off" value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
              </label>
              <button type="button" class="primary" disabled={signingIn || !hasCode || password === '' || settings.phone.trim() === ''} onClick={login}>
                Đăng nhập
              </button>
              {signingIn && <p class="hint">Agent đang đăng nhập Alobo, mất khoảng 30 giây…</p>}
            </>
          ) : (
            <>
              <p class="hint">Đã đăng nhập Alobo bằng số {settings.phone}. Tên và số điện thoại của đơn lấy từ tài khoản này.</p>
              <div class="row-actions wrap">
                <button type="button" class="neutral" disabled={busy} onClick={() => logout(false)}>
                  Đăng xuất
                </button>
                <button type="button" class="neutral" disabled={busy} onClick={() => logout(true)}>
                  Xoá mật khẩu đã lưu
                </button>
              </div>
            </>
          )}
          {loginError && (
            <>
              <p class="error">{loginError.message}</p>
              {loginError.screenshot && <ShotViewer src={loginError.screenshot} alt="Màn hình Alobo lúc đăng nhập lỗi" />}
            </>
          )}
        </section>
      )}

      {BOOKING_API_URL && (who === 'guest' || session) && (
        <>
      <section>
        <h2>Yêu cầu</h2>
        <div class="segmented">
          <button type="button" class={mode === 'command' ? 'primary' : ''} onClick={() => setMode('command')}>
            Gõ câu lệnh
          </button>
          <button type="button" class={mode === 'form' ? 'primary' : ''} onClick={() => setMode('form')}>
            Chọn tay
          </button>
        </div>
        {mode === 'command' ? (
          <label class="field">
            <textarea
              value={command}
              placeholder="VD: mai 19h-21h, sân nào cũng được"
              onInput={(e) => setCommand((e.target as HTMLTextAreaElement).value)}
            />
          </label>
        ) : (
          <>
            <label class="field">
              <span>Ngày</span>
              <input
                type="date"
                value={form.date}
                min={today()}
                onInput={(e) => setForm({ ...form, date: (e.target as HTMLInputElement).value })}
              />
            </label>
            <div class="grid2">
              <label class="field">
                <span>Bắt đầu</span>
                <select value={form.start} onChange={(e) => setForm({ ...form, start: (e.target as HTMLSelectElement).value })}>
                  {START_SLOTS.map((t) => (
                    <option value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label class="field">
                <span>Kết thúc</span>
                <select value={form.end} onChange={(e) => setForm({ ...form, end: (e.target as HTMLSelectElement).value })}>
                  {END_SLOTS.map((t) => (
                    <option value={t}>{t}</option>
                  ))}
                </select>
              </label>
            </div>
            <label class="field">
              <span>Sân</span>
              <select
                value={form.court === null ? '' : String(form.court)}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  setForm({ ...form, court: v === '' ? null : Number(v) });
                }}
              >
                <option value="">Sân bất kỳ (ưu tiên 4–9, rồi 3, 2, 1)</option>
                {COURTS.map((c) => (
                  <option value={String(c)}>C.Lông {c}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </section>

      {(phase === 'idle' || phase === 'preparing') && (
        <>
          <button type="button" class="primary" disabled={busy || !ready} onClick={prepare}>
            Nhờ Agent chuẩn bị
          </button>
          {phase === 'preparing' && <p class="hint">Agent đang thao tác trên Alobo, mất khoảng 30 giây…</p>}
        </>
      )}

      {error && (
        <>
          <p class="error">{error.message}</p>
          {error.screenshot && <ShotViewer src={error.screenshot} alt="Màn hình Alobo lúc xảy ra lỗi" />}
        </>
      )}

      {(phase === 'prepared' || phase === 'confirming') && prepared && s && expires && (
        <div class="card">
          <p>
            Ngày {s.date.split('-').reverse().join('/')} · {s.court} · {s.start}–{s.end} · {formatVnd(s.total)}
          </p>
          <ShotViewer src={prepared.screenshot} alt="Trang xác nhận trên Alobo" />
          <p class="hint">
            Kiểm tra tên và số điện thoại trong ảnh. Hết hạn lúc {p2(expires.getHours())}:{p2(expires.getMinutes())}.
          </p>
          <div class="row-actions">
            <button type="button" class="primary" disabled={phase === 'confirming'} onClick={confirm}>
              Xác nhận đặt
            </button>
            <button type="button" class="neutral" disabled={phase === 'confirming'} onClick={cancel}>
              Huỷ
            </button>
          </div>
          {phase === 'confirming' && <p class="hint">Đang gửi đơn lên Alobo…</p>}
        </div>
      )}

      {(phase === 'done' || phase === 'paying') && done && (
        <div class="card">
          {done.payment ? (
            <p>
              Đã tạo đơn {done.payment.orderId ?? ''}. Chuyển khoản {done.payment.amount === null ? '' : formatVnd(done.payment.amount)} theo mã
              QR trong ảnh, rồi chọn ảnh chuyển khoản và gửi lên.
            </p>
          ) : (
            <p>
              {done.status === 'rejected' && done.texts.some((t) => t.includes('đã có tài khoản'))
                ? 'Số điện thoại này đã có tài khoản Alobo nên không đặt được khi không đăng nhập. Hãy chọn "Đăng nhập Alobo" rồi đặt lại.'
                : DONE_MESSAGE[done.status]}
            </p>
          )}
          <ShotViewer src={done.screenshot} alt="Kết quả trên Alobo" />
          {done.payment ? (
            <>
              <p class="hint">
                {secondsLeft > 0
                  ? `Alobo còn giữ chỗ ${p2(Math.floor(secondsLeft / 60))}:${p2(secondsLeft % 60)}. Hết giờ mà chưa gửi ảnh thì đơn bị nhả.`
                  : 'Đã hết thời gian giữ chỗ, đơn có thể đã bị nhả.'}
              </p>
              <label class="field">
                <span>Ảnh chuyển khoản (PNG/JPG)</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => setFile((e.target as HTMLInputElement).files?.[0] ?? null)}
                />
              </label>
              <button type="button" class="primary" disabled={!file || phase === 'paying' || secondsLeft <= 0} onClick={pay}>
                Gửi ảnh thanh toán
              </button>
              {phase === 'paying' && <p class="hint">Agent đang gửi ảnh lên Alobo…</p>}
            </>
          ) : (
            <ul>
              {done.texts.map((t) => (
                <li>{t}</li>
              ))}
            </ul>
          )}
          <button type="button" class="neutral" disabled={phase === 'paying'} onClick={reset}>
            {done.payment ? 'Đóng, không gửi ảnh' : 'Đặt lượt khác'}
          </button>
        </div>
      )}

      {phase === 'paid' && paid && (
        <div class="card">
          <p>Đã gửi ảnh thanh toán lên Alobo. Xem ảnh để biết Alobo đã nhận chưa.</p>
          <ShotViewer src={paid.screenshot} alt="Kết quả sau khi gửi ảnh thanh toán" />
          <ul>
            {paid.texts.map((t) => (
              <li>{t}</li>
            ))}
          </ul>
          <button type="button" onClick={reset}>
            Đặt lượt khác
          </button>
        </div>
      )}
        </>
      )}
    </main>
  );
}
