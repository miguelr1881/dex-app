'use strict';
const CACHE = 'dex-pages-shell-crypto4';
const SHELL = ["./", "./index.html", "./portal.css", "./manifest.webmanifest", "./app.css", "./app.js", "./i18n.js", "./sheets-reader.js", "./snapshot.js", "./portal.js", "./lucide.js", "./icon.png", "./icon-512.png", "./privacy.html", "./privacy.css"].map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('dex-pages-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    url.hash = '';
    if (event.request.method !== 'GET' || !SHELL.includes(url.href) || event.request.headers.has('Authorization')) return;
    event.respondWith(fetch(event.request).then(response => {
        if (!response.ok) throw new Error('Shell unavailable');
        return response;
    }).catch(() => caches.match(url.href)));
});
