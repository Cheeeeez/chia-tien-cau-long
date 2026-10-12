// spoo.me API v1: không cần key, trả CORS `*` nên gọi thẳng từ trình duyệt được (GitHub Pages không có backend).
// Giới hạn ẩn danh 20 request/phút/IP => chỉ gọi khi cần và nhớ kết quả theo URL. Từ chối URL localhost (400).
const ENDPOINT = 'https://spoo.me/api/v1/shorten';
const TIMEOUT_MS = 6000;

const cache = new Map<string, Promise<string>>();

async function request(url: string): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ long_url: url }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`shorten: ${res.status}`);
  const data: unknown = await res.json();
  const short = data && typeof data === 'object' && 'short_url' in data ? data.short_url : null;
  if (typeof short !== 'string' || !short.startsWith('https://')) throw new Error('shorten: phản hồi lạ');
  return short;
}

/** Link rút gọn của `url`; lỗi mạng/quá giới hạn thì trả lại chính `url` (luôn resolve, không ném lỗi). */
export function shortenUrl(url: string): Promise<string> {
  let p = cache.get(url);
  if (!p) {
    p = request(url).catch(() => {
      cache.delete(url); // lần sau thử lại
      return url;
    });
    cache.set(url, p);
  }
  return p;
}
