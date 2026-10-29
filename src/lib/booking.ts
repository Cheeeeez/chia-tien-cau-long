/** Địa chỉ máy chủ đặt sân, cố định lúc build (biến VITE_BOOKING_API_URL); rỗng nghĩa là chưa cấu hình. */
export const BOOKING_API_URL: string = import.meta.env.VITE_BOOKING_API_URL ?? '';

/** Ca 18:00–20:00 là một ô duy nhất trên bảng chọn giờ của Alobo (phút từ 00:00). Trùng với `FIXED_BLOCK` ở server/src/intent.ts. */
const FIXED_BLOCK = { start: 1080, end: 1200 };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Lý do khung [start, end) không đặt được vì cắt ngang ca cố định; null nếu hợp lệ. */
export function fixedBlockError(start: string, end: string): string | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  const cuts = s < FIXED_BLOCK.end && e > FIXED_BLOCK.start && (s > FIXED_BLOCK.start || e < FIXED_BLOCK.end);
  return cuts ? 'Ca 18:00–20:00 là một ô cố định: hãy đặt trọn 18:00–20:00 (hoặc trùm cả ca), không đặt lẻ một phần.' : null;
}

export type BookingRequest =
  | { command: string }
  | { date: string; start: string; end: string; court: number | null };

export interface Summary {
  date: string;
  court: string;
  start: string;
  end: string;
  total: number;
}

export interface Prepared {
  id: string;
  summary: Summary;
  screenshot: string;
  expiresAt: number;
}

/** Màn thanh toán của Alobo sau khi đơn được tạo: phải chuyển khoản rồi gửi ảnh trước khi hết giữ chỗ. */
export interface Payment {
  orderId: string | null;
  amount: number | null;
  holdSeconds: number | null;
  /** Ảnh PNG (data URL) chỉ gồm mã QR thanh toán, cắt từ màn Alobo; null khi máy chủ không tìm thấy mã trong ảnh chụp. */
  qr: string | null;
}

export interface Confirmed {
  status: 'submitted' | 'rejected' | 'unknown';
  texts: string[];
  screenshot: string;
  payment: Payment | null;
  /** Giờ máy chủ thôi giữ phiên thanh toán (ms); null khi không có màn thanh toán. */
  expiresAt: number | null;
}

export interface Paid {
  status: 'submitted' | 'rejected' | 'unknown';
  texts: string[];
  screenshot: string;
}

export class BookingError extends Error {
  constructor(
    message: string,
    public screenshot?: string,
    public status?: number,
  ) {
    super(message);
  }
}

/** Thông tin xác thực gửi kèm mọi lệnh gọi: mã truy cập chung của nhóm, và `session` (`<sđt>:<mã thiết bị>`) sau khi đăng nhập Alobo. */
export interface Auth {
  code: string;
  session: string;
}

async function call<T>(a: Auth, path: string, method: string, timeoutMs: number, body?: unknown): Promise<T> {
  if (!BOOKING_API_URL) throw new BookingError('Chưa cấu hình máy chủ đặt sân');
  let res: Response;
  try {
    res = await fetch(new URL(path, BOOKING_API_URL.endsWith('/') ? BOOKING_API_URL : BOOKING_API_URL + '/'), {
      method,
      headers: {
        'X-Access-Code': a.code,
        ...(a.session ? { Authorization: `Bearer ${a.session}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new BookingError('Không kết nối được máy chủ đặt sân');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // 204 hoặc phản hồi không phải JSON
  }
  if (!res.ok) {
    const d = (data && typeof data === 'object' ? data : {}) as { error?: unknown; screenshot?: unknown };
    throw new BookingError(
      typeof d.error === 'string' ? d.error : `Lỗi máy chủ (${res.status})`,
      typeof d.screenshot === 'string' ? d.screenshot : undefined,
      res.status,
    );
  }
  return data as T;
}

const enc = encodeURIComponent;

/** Đăng nhập bằng SĐT + mật khẩu Alobo. Máy chủ thao tác trên Alobo thật (khoảng 30 giây), đúng thì cấp `session` cho thiết bị này. */
export function signIn(code: string, phone: string, password: string): Promise<{ phone: string; session: string }> {
  return call({ code, session: '' }, 'accounts', 'POST', 120_000, { phone, password });
}

/** Kiểm tra mã truy cập và `session` còn hiệu lực (403 sai mã, 401 hết phiên). */
export function checkSession(a: Auth): Promise<{ phone: string }> {
  return call(a, 'account', 'GET', 10_000);
}

/** Đăng xuất thiết bị này; mật khẩu đã lưu trên máy chủ vẫn giữ. */
export async function signOut(a: Auth): Promise<void> {
  await call(a, 'account/logout', 'POST', 10_000, {});
}

/** Xoá tài khoản khỏi máy chủ: phiên, mật khẩu đã lưu và mọi thiết bị đang đăng nhập. */
export async function deleteAccount(a: Auth): Promise<void> {
  await call(a, 'account', 'DELETE', 10_000);
}

/** `guest`: tên + SĐT khi đặt không cần tài khoản (bỏ trống nếu đã đăng nhập Alobo, Alobo tự điền). */
export function prepareBooking(a: Auth, req: BookingRequest, guest?: { name: string; phone: string }): Promise<Prepared> {
  return call(a, 'bookings', 'POST', 150_000, { ...req, ...guest });
}

export function confirmBooking(a: Auth, id: string): Promise<Confirmed> {
  return call(a, `bookings/${enc(id)}/confirm`, 'POST', 60_000, {});
}

export async function cancelBooking(a: Auth, id: string): Promise<void> {
  try {
    await call(a, `bookings/${enc(id)}`, 'DELETE', 10_000);
  } catch {
    // phiên tự hết hạn sau vài phút
  }
}

/** Gửi ảnh chuyển khoản (data URL JPG/PNG) lên Alobo cho đơn đang chờ thanh toán. */
export function payBooking(a: Auth, id: string, image: string): Promise<Paid> {
  return call(a, `bookings/${enc(id)}/payment`, 'POST', 90_000, { image });
}

/** Thu nhỏ ảnh về JPEG tối đa 1600px: ảnh chụp từ điện thoại thường vượt giới hạn 5MB của Alobo. */
export async function toPaymentImage(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    throw new BookingError('Không đọc được ảnh, hãy chọn ảnh PNG hoặc JPG khác');
  }
}
