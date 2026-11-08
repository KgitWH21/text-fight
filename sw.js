// Bump VERSION for every release. Cache updates never touch localStorage.
const VERSION = '1.2.0';
const PREFIX = `text-fight:${new URL(self.registration.scope).pathname}:`;
const CACHE = PREFIX + VERSION;
const FILES = ['./', './index.html', './style.css', './app.js', './core.js', './manifest.webmanifest', './data/sentence-trainer.json', './data/words.json', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
const urls = FILES.map(file => new URL(file, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)).then(() => {
    // First install works immediately. Future versions wait for the writer.
    if (!self.registration.active) return self.skipWaiting();
  }));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => { if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url); url.search = '';
  if (!urls.includes(url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.href)) || fetch(event.request)));
});
