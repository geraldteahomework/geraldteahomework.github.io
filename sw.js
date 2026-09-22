// Service worker: caches the app shell so the page opens without a connection.
// Data always comes from the network; offline changes are queued by app.js.
// Paths are relative to where the app is served from (/ on the Pi, /homework/ on the fixed link).
const CACHE = 'homework-shell-v15';
const ROOT = new URL('./', self.location).href;
const SHELL = ['./', './index.html', './login.html', './style.css', './site.js', './i18n.js', './app.js', './manifest.json', './manifest-sq.json', './icons/icon-192.png']
  .map(p => new URL(p, self.location).href);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || !url.href.startsWith(ROOT) || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || (e.request.mode === 'navigate' ? caches.match(ROOT) : undefined)))
  );
});
