import { afterEach, describe, expect, it, vi } from 'vitest';
import { shortenUrl } from './shorten';

const ok = (short_url: string) => new Response(JSON.stringify({ short_url }), { status: 201 });

afterEach(() => vi.unstubAllGlobals());

describe('shortenUrl', () => {
  it('trả link rút gọn và chỉ gọi mạng một lần cho cùng URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok('https://spoo.me/abc'));
    vi.stubGlobal('fetch', fetchMock);
    const [a, b] = await Promise.all([shortenUrl('https://x.test/?b=1'), shortenUrl('https://x.test/?b=1')]);
    expect(a).toBe('https://spoo.me/abc');
    expect(b).toBe(a);
    expect(await shortenUrl('https://x.test/?b=1')).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lỗi thì trả lại URL gốc và lần sau thử lại', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(ok('https://spoo.me/zzz'));
    vi.stubGlobal('fetch', fetchMock);
    expect(await shortenUrl('https://x.test/?b=2')).toBe('https://x.test/?b=2');
    expect(await shortenUrl('https://x.test/?b=2')).toBe('https://spoo.me/zzz');
  });

  it('phản hồi không có short_url thì trả lại URL gốc', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"x"}', { status: 200 })));
    expect(await shortenUrl('https://x.test/?b=3')).toBe('https://x.test/?b=3');
  });
});
