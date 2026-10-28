import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext } from 'playwright';

export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export interface StoredAccount {
  state: StorageState;
  /** null khi chưa lưu mật khẩu hoặc không giải mã được (đổi SECRET_KEY). */
  password: string | null;
  updatedAt: number;
}

interface Sealed {
  iv: string;
  tag: string;
  data: string;
}

interface FileShape {
  updatedAt: number;
  state: StorageState;
  password: Sealed | null;
  /** SHA-256 (hex) của mã từng thiết bị đã đăng nhập; mã gốc chỉ nằm trên thiết bị. */
  devices: string[];
}

const MAX_DEVICES = 10;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Lưu phiên đăng nhập Alobo (storageState gồm cả IndexedDB), mật khẩu và các thiết bị được phép theo SĐT 9 chữ số.
 * Mật khẩu mã hoá AES-256-GCM bằng khoá suy ra từ `secret`; file chỉ chủ sở hữu đọc được (0600).
 */
export class AccountStore {
  private key: Buffer;

  constructor(
    private dir: string,
    secret: string,
  ) {
    this.key = scryptSync(secret, 'dat-san-agent/accounts', 32);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  private file(phone: string): string {
    if (!/^\d{9}$/.test(phone)) throw new Error('SĐT phải là 9 chữ số');
    return join(this.dir, `${phone}.json`);
  }

  private seal(plain: string): Sealed {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return { iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
  }

  private open(s: Sealed): string | null {
    try {
      const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(s.iv, 'base64'));
      d.setAuthTag(Buffer.from(s.tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(s.data, 'base64')), d.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  private read(phone: string): FileShape | null {
    try {
      const v = JSON.parse(readFileSync(this.file(phone), 'utf8')) as FileShape;
      return { ...v, devices: v.devices ?? [] };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  private write(phone: string, v: FileShape): void {
    const f = this.file(phone);
    const tmp = `${f}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(v), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, f); // thay nguyên tử: không để lại file ghi dở
  }

  load(phone: string): StoredAccount | null {
    const v = this.read(phone);
    if (!v) return null;
    return { state: v.state, password: v.password ? this.open(v.password) : null, updatedAt: v.updatedAt };
  }

  /** Đăng nhập mới: ghi cả phiên lẫn mật khẩu, giữ nguyên các thiết bị đã đăng nhập. */
  saveLogin(phone: string, state: StorageState, password: string): void {
    const prev = this.read(phone);
    this.write(phone, { updatedAt: Date.now(), state, password: this.seal(password), devices: prev?.devices ?? [] });
  }

  /** Cập nhật token Alobo đã làm mới, giữ nguyên mật khẩu và thiết bị. */
  saveState(phone: string, state: StorageState): void {
    const prev = this.read(phone);
    this.write(phone, {
      updatedAt: Date.now(),
      state,
      password: prev?.password ?? null,
      devices: prev?.devices ?? [],
    });
  }

  /** Cấp mã cho một thiết bị mới (chỉ trả về một lần); giữ tối đa MAX_DEVICES thiết bị gần nhất. */
  addDevice(phone: string): string {
    const prev = this.read(phone);
    if (!prev) throw new Error('Chưa có tài khoản cho SĐT này');
    const token = randomBytes(32).toString('hex');
    this.write(phone, { ...prev, devices: [...prev.devices, sha256(token)].slice(-MAX_DEVICES) });
    return token;
  }

  hasDevice(phone: string, token: string): boolean {
    const hash = Buffer.from(sha256(token));
    // so khớp với mọi mã (không dừng sớm) để thời gian không lộ vị trí khớp
    return (this.read(phone)?.devices ?? []).reduce(
      (found, d) => (timingSafeEqual(Buffer.from(d), hash) ? true : found),
      false,
    );
  }

  removeDevice(phone: string, token: string): void {
    const prev = this.read(phone);
    if (prev) this.write(phone, { ...prev, devices: prev.devices.filter((d) => d !== sha256(token)) });
  }

  /** Xoá toàn bộ: phiên, mật khẩu và mọi thiết bị. */
  remove(phone: string): void {
    rmSync(this.file(phone), { force: true });
  }
}
