import { BookingError, getPushKey, type Auth, type PushSub } from './booking';
import { isIos } from './vietqr';

/** `needs-install`: iOS chỉ cho nhận thông báo đẩy khi app đã thêm vào Màn hình chính và mở từ đó. */
export type PushSupport = 'ok' | 'needs-install' | 'unsupported';

export function supportFrom(env: { serviceWorker: boolean; pushManager: boolean; notification: boolean; ios: boolean; standalone: boolean }): PushSupport {
  if (env.ios && !env.standalone) return 'needs-install';
  return env.serviceWorker && env.pushManager && env.notification ? 'ok' : 'unsupported';
}

export function pushSupport(): PushSupport {
  return supportFrom({
    // Service worker chỉ được đăng ký ở bản build (main.tsx), nên chạy dev không có thông báo.
    serviceWorker: import.meta.env.PROD && 'serviceWorker' in navigator,
    pushManager: 'PushManager' in window,
    notification: 'Notification' in window,
    ios: isIos(navigator.userAgent),
    standalone:
      matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  });
}

/** Khoá VAPID công khai (base64url) → byte, đúng dạng `applicationServerKey` của PushManager. */
export function urlBase64ToUint8Array(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (b64url + '='.repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const sameBytes = (a: ArrayBuffer | null, b: Uint8Array) => {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return b.every((v, i) => v === x[i]);
};

function toPushSub(sub: PushSubscription): PushSub {
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new BookingError('Trình duyệt trả về đăng ký thông báo không đầy đủ');
  return { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } };
}

/** Đăng ký thông báo đang có của thiết bị này (không xin quyền, không gọi mạng); null nếu chưa có. */
export async function currentSubscription(): Promise<PushSub | null> {
  if (pushSupport() !== 'ok') return null;
  try {
    const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    return sub ? toPushSub(sub) : null;
  } catch {
    return null;
  }
}

/**
 * Xin quyền thông báo (phải gọi từ thao tác bấm nút của người dùng) rồi đăng ký Web Push với khoá của máy chủ.
 * Đăng ký cũ dùng khoá VAPID khác (máy chủ đổi khoá) thì huỷ để đăng ký lại.
 */
export async function ensureSubscription(auth: Auth): Promise<PushSub> {
  if (pushSupport() !== 'ok') throw new BookingError('Thiết bị này chưa nhận được thông báo đẩy');
  if (Notification.permission === 'denied') {
    throw new BookingError('Thông báo đang bị chặn cho app này, hãy bật lại trong cài đặt của điện thoại');
  }
  if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') {
    throw new BookingError('Chưa được cấp quyền thông báo');
  }
  const key = urlBase64ToUint8Array((await getPushKey(auth)).publicKey);
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameBytes(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    throw new BookingError('Không đăng ký được thông báo đẩy trên thiết bị này');
  }
  return toPushSub(sub);
}
