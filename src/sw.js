// Template: plugin `service-worker` trong vite.config.ts điền phiên bản và danh sách precache lúc build.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__; // đường dẫn tương đối với sw.js, gồm 'index.html'
const CACHE = `chia-tien-${VERSION}`;
const SHELL = new URL('index.html', self.location).href;

// Tải lại từ mạng, bỏ qua cache HTTP: GitHub Pages trả max-age=600 nên addAll có thể lấy nhầm index.html cũ
// (trỏ tới asset đã bị xoá khỏi server) -> trang trắng.
async function precache() {
  const cache = await caches.open(CACHE);
  try {
    await Promise.all(
      PRECACHE.map(async (path) => {
        const req = new Request(path, { cache: 'reload' });
        const res = await fetch(req);
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        await cache.put(req, res);
      }),
    );
  } catch (err) {
    await caches.delete(CACHE); // không để lại cache dở dang
    throw err;
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(precache().then(() => self.skipWaiting()));
});

// Giữ lại cache của bản ngay trước: trang đang mở bằng bản cũ vẫn cần asset cũ khi SW mới kích hoạt giữa chừng.
// caches.keys() trả theo thứ tự tạo.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const mine = keys.filter((k) => k.startsWith('chia-tien-'));
        const keep = new Set(mine.slice(Math.max(0, mine.indexOf(CACHE) - 1), mine.indexOf(CACHE) + 1));
        return Promise.all(mine.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim()),
  );
});

// Thông báo đẩy từ máy chủ đặt sân (theo dõi sân trống): payload { title, body, tag, url }.
self.addEventListener('push', (e) => {
  let p = {};
  try {
    p = e.data ? e.data.json() : {};
  } catch {
    p = { body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.registration.showNotification(p.title || 'Goodminton', {
      body: p.body || '',
      tag: p.tag,
      renotify: Boolean(p.tag), // cùng khung báo lại thì vẫn rung/kêu
      icon: 'icons/icon-192.png',
      data: { url: p.url },
    }),
  );
});

// Bấm thông báo: dùng lại cửa sổ app đang mở (nếu có) rồi chuyển tới link; link phải cùng origin.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  let target = new URL('./?dat-san', self.registration.scope);
  try {
    const u = new URL((e.notification.data && e.notification.data.url) || '', self.registration.scope);
    if (u.origin === self.location.origin) target = u;
  } catch {
    // giữ link mặc định
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      if (open) {
        try {
          await open.focus();
          return await open.navigate(target.href);
        } catch {
          // trình duyệt không cho điều hướng: mở cửa sổ mới
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});

const NAV_TIMEOUT_MS = 4000;
// ignoreVary: server có thể trả `Vary: Origin`; script/style `crossorigin` gửi Origin còn lúc precache thì không.
const lookup = (key) =>
  caches
    .open(CACHE)
    .then((c) => c.match(key, { ignoreVary: true }))
    .then((r) => r || caches.match(key, { ignoreVary: true })); // bản trước còn giữ

// Trang: ưu tiên mạng để deploy xong là thấy ngay bản mới (index.html trỏ tới asset băm tên mới, asset chưa có trong
// cache thì SW tải từ mạng). Mất mạng / mạng chậm quá NAV_TIMEOUT_MS / server lỗi thì dùng bản đã cache.
// cache: 'no-cache' bỏ qua max-age=600 của GitHub Pages nhưng vẫn chỉ tốn một lần 304 khi không đổi.
function navigate() {
  const timeout = new Promise((_, reject) => setTimeout(reject, NAV_TIMEOUT_MS));
  return Promise.race([fetch(SHELL, { cache: 'no-cache' }), timeout])
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r;
    })
    .catch(() => lookup(SHELL).then((r) => r || fetch(SHELL)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Không chặn request khác origin (img.vietqr.io, dl.vietqr.io): luôn đi mạng như cũ.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Mọi trang (kể cả ?b=...) đều là cùng một index.html.
  if (req.mode === 'navigate') {
    e.respondWith(navigate());
    return;
  }
  // Asset có băm trong tên: cache trước, mạng sau.
  e.respondWith(lookup(req).then((r) => r || fetch(req)));
});
