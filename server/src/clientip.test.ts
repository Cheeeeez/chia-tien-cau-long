import { describe, expect, it } from 'vitest';
import { clientKey } from './clientip.js';

describe('clientKey', () => {
  it('không tin proxy thì bỏ qua header', () => {
    expect(clientKey('6.6.6.6', '203.0.113.9', false)).toBe('203.0.113.9');
  });

  it('sau proxy lấy phần tử cuối, bỏ phần client chèn vào trước', () => {
    expect(clientKey('6.6.6.6, 203.0.113.9', '172.18.0.1', true)).toBe('203.0.113.9');
    expect(clientKey(['6.6.6.6', '203.0.113.9'], '172.18.0.1', true)).toBe('203.0.113.9');
  });

  it('không có header thì dùng địa chỉ socket', () => {
    expect(clientKey(undefined, '172.18.0.1', true)).toBe('172.18.0.1');
    expect(clientKey(undefined, undefined, true)).toBe('unknown');
  });

  it('IPv4 dạng mapped được rút gọn', () => {
    expect(clientKey(undefined, '::ffff:203.0.113.9', false)).toBe('203.0.113.9');
  });

  it('IPv6 gộp theo /64', () => {
    const a = clientKey('2001:db8:1:2:aaaa::1', undefined, true);
    expect(a).toBe('2001:db8:1:2::/64');
    expect(clientKey('2001:db8:1:2:bbbb:cccc:dddd:2', undefined, true)).toBe(a);
    expect(clientKey('2001:db8::1', undefined, true)).toBe('2001:db8:0:0::/64');
    expect(clientKey('2001:db8:1:3::1', undefined, true)).not.toBe(a);
  });
});
