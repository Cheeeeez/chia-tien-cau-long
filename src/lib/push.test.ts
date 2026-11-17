import { describe, expect, it } from 'vitest';
import { supportFrom, urlBase64ToUint8Array } from './push';

describe('urlBase64ToUint8Array', () => {
  it('giải mã base64url không đệm', () => {
    // "hello" = aGVsbG8 (base64url, không có "=")
    expect([...urlBase64ToUint8Array('aGVsbG8')]).toEqual([104, 101, 108, 108, 111]);
  });

  it('đổi - và _ về + và /', () => {
    // bytes 0xfb 0xff 0xbe = "-_--" trong base64url ("+/++" trong base64)
    expect([...urlBase64ToUint8Array('-_--')]).toEqual([0xfb, 0xff, 0xbe]);
  });

  it('khoá VAPID 65 byte (dạng điểm P-256 chưa nén) giữ đúng độ dài', () => {
    const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString('base64url');
    const out = urlBase64ToUint8Array(key);
    expect(out).toHaveLength(65);
    expect(out[0]).toBe(4);
  });
});

describe('supportFrom', () => {
  const base = { serviceWorker: true, pushManager: true, notification: true, ios: false, standalone: false };

  it('Android/desktop đủ API thì dùng được kể cả chưa cài app', () => {
    expect(supportFrom(base)).toBe('ok');
  });

  it('iOS chưa thêm vào màn hình chính thì cần cài app', () => {
    expect(supportFrom({ ...base, ios: true })).toBe('needs-install');
  });

  it('iOS đã cài app và có đủ API thì dùng được', () => {
    expect(supportFrom({ ...base, ios: true, standalone: true })).toBe('ok');
  });

  it('thiếu API thì không hỗ trợ', () => {
    expect(supportFrom({ ...base, pushManager: false })).toBe('unsupported');
    expect(supportFrom({ ...base, serviceWorker: false })).toBe('unsupported');
    expect(supportFrom({ ...base, ios: true, standalone: true, notification: false })).toBe('unsupported');
  });
});
