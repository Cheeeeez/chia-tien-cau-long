import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountStore, type StorageState } from './accounts.js';

const state: StorageState = {
  cookies: [],
  origins: [{ origin: 'https://datlich.alobo.vn', localStorage: [{ name: 'flutter.access_token', value: 'tok' }] }],
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'acct-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('AccountStore', () => {
  it('lưu rồi đọc lại đúng phiên và mật khẩu; chưa lưu thì null', () => {
    const s = new AccountStore(dir, 'bí-mật-dài-đủ-16-ký-tự');
    expect(s.load('965668565')).toBeNull();
    s.saveLogin('965668565', state, 'Secret123@');
    const got = s.load('965668565');
    expect(got?.state).toEqual(state);
    expect(got?.password).toBe('Secret123@');
  });

  it('mật khẩu không nằm dạng rõ trong file và file chỉ chủ sở hữu đọc được', () => {
    const s = new AccountStore(dir, 'bí-mật-dài-đủ-16-ký-tự');
    s.saveLogin('965668565', state, 'Secret123@');
    const f = join(dir, '965668565.json');
    expect(statSync(f).mode & 0o077).toBe(0);
    expect(readFileSync(f, 'utf8')).not.toContain('Secret123@');
  });

  it('đổi khoá bí mật thì không giải mã được mật khẩu nhưng vẫn giữ phiên', () => {
    new AccountStore(dir, 'bí-mật-dài-đủ-16-ký-tự').saveLogin('965668565', state, 'Secret123@');
    const got = new AccountStore(dir, 'khoá-khác-hoàn-toàn-xyz').load('965668565');
    expect(got?.password).toBeNull();
    expect(got?.state).toEqual(state);
  });

  it('saveState giữ nguyên mật khẩu đã lưu', () => {
    const s = new AccountStore(dir, 'bí-mật-dài-đủ-16-ký-tự');
    s.saveLogin('965668565', state, 'Secret123@');
    const refreshed = { ...state, cookies: [] as StorageState['cookies'], origins: [] };
    s.saveState('965668565', refreshed);
    expect(s.load('965668565')).toMatchObject({ state: refreshed, password: 'Secret123@' });
  });

  it('remove xoá tài khoản; SĐT không phải 9 chữ số bị từ chối (chống ../)', () => {
    const s = new AccountStore(dir, 'bí-mật-dài-đủ-16-ký-tự');
    s.saveLogin('965668565', state, 'x');
    s.remove('965668565');
    expect(s.load('965668565')).toBeNull();
    expect(() => s.load('../etc/passwd')).toThrow();
  });

  describe('thiết bị', () => {
    const secret = 'bí-mật-dài-đủ-16-ký-tự';

    it('mã cấp cho thiết bị chỉ khớp đúng SĐT đó, mã sai hoặc SĐT khác thì không', () => {
      const s = new AccountStore(dir, secret);
      s.saveLogin('965668565', state, 'x');
      s.saveLogin('911111111', state, 'y');
      const token = s.addDevice('965668565');
      expect(s.hasDevice('965668565', token)).toBe(true);
      expect(s.hasDevice('965668565', 'a'.repeat(64))).toBe(false);
      expect(s.hasDevice('911111111', token)).toBe(false);
      expect(s.hasDevice('900000000', token)).toBe(false); // chưa có tài khoản
    });

    it('mã gốc không nằm trong file, chỉ có bản băm', () => {
      const s = new AccountStore(dir, secret);
      s.saveLogin('965668565', state, 'x');
      const token = s.addDevice('965668565');
      expect(readFileSync(join(dir, '965668565.json'), 'utf8')).not.toContain(token);
    });

    it('đăng nhập lại và làm mới phiên không làm mất các thiết bị đã cấp', () => {
      const s = new AccountStore(dir, secret);
      s.saveLogin('965668565', state, 'x');
      const token = s.addDevice('965668565');
      s.saveLogin('965668565', state, 'mật-khẩu-mới');
      s.saveState('965668565', state);
      expect(s.hasDevice('965668565', token)).toBe(true);
      expect(s.load('965668565')?.password).toBe('mật-khẩu-mới');
    });

    it('đăng xuất một thiết bị không ảnh hưởng thiết bị khác; xoá tài khoản thu hồi tất cả', () => {
      const s = new AccountStore(dir, secret);
      s.saveLogin('965668565', state, 'x');
      const a = s.addDevice('965668565');
      const b = s.addDevice('965668565');
      s.removeDevice('965668565', a);
      expect(s.hasDevice('965668565', a)).toBe(false);
      expect(s.hasDevice('965668565', b)).toBe(true);
      s.remove('965668565');
      expect(s.hasDevice('965668565', b)).toBe(false);
    });

    it('chỉ giữ 10 thiết bị gần nhất', () => {
      const s = new AccountStore(dir, secret);
      s.saveLogin('965668565', state, 'x');
      const tokens = Array.from({ length: 11 }, () => s.addDevice('965668565'));
      expect(s.hasDevice('965668565', tokens[0])).toBe(false);
      expect(s.hasDevice('965668565', tokens[10])).toBe(true);
    });
  });
});
