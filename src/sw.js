// Template: plugin `service-worker` trong vite.config.ts điền phiên bản và danh sách precache lúc build.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__; // đường dẫn tương đối với sw.js, gồm 'index.html'
const CACHE = `chia-tien-${VERSION}`;
const SHELL = new URL('index.html', self.location).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('chia-tien-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Không chặn request khác origin (img.vietqr.io, dl.vietqr.io): luôn đi mạng như cũ.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // ignoreVary: server có thể trả `Vary: Origin`; script/style `crossorigin` gửi Origin còn lúc precache thì không.
  const opts = { ignoreVary: true };
  // Mọi trang (kể cả ?b=...) đều là cùng một index.html: trả bản đã cache để mở tức thì / khi mất mạng.
  if (req.mode === 'navigate') {
    e.respondWith(caches.match(SHELL, opts).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, opts).then((r) => r || fetch(req)));
});
