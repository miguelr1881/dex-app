'use strict';
const CACHE = 'dex-pages-shell-v1';
const SHELL = ["./", "./index.html", "./portal.css", "./manifest.webmanifest", "./app.css", "./app.js", "./i18n.js", "./sheets-reader.js", "./portal.js", "./lucide.js", "./icon.png", "./icon-512.png"].map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !SHELL.includes(event.request.url) || event.request.headers.has('Authorization')) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request.url)));
});
