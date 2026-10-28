import { isIPv6 } from 'node:net';

/**
 * Khoá giới hạn thử sai của một request.
 * Sau proxy (`trustProxy`) lấy phần tử CUỐI của X-Forwarded-For: do proxy gần nhất ghi (Tailscale Funnel đặt hẳn giá trị,
 * nginx/Caddy/Cloudflare nối vào cuối), client không giả được. Các phần tử phía trước và CF-Connecting-IP do client tự đặt nên bỏ qua.
 * IPv6 gộp theo /64 vì một mạng nhà thường được cấp cả dải /64.
 */
export function clientKey(
  forwardedFor: string | string[] | undefined,
  remoteAddress: string | undefined,
  trustProxy: boolean,
): string {
  const raw = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor ?? '');
  const hops = trustProxy ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const ip = (hops.at(-1) ?? remoteAddress ?? 'unknown').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  return isIPv6(ip) ? prefix64(ip) : ip;
}

/** 4 nhóm đầu của địa chỉ IPv6 (bung `::`, bỏ zone `%eth0`), dạng `a:b:c:d::/64`. */
function prefix64(ip: string): string {
  const [head, tail] = ip.split('%')[0].split('::');
  const h = head ? head.split(':') : [];
  const t = tail === undefined ? [] : tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}
