'use strict';
const CACHE = 'dex-pages-shell-0.9.0-plan13';
const IMAGES = 'dex-pages-images-v1';
const SHELL = ["./", "./index.html", "./portal.css", "./manifest.webmanifest", "./brand-ibkr.png", "./dex.css", "./app.js", "./plan.js", "./native.js", "./i18n.js", "./sheets-reader.js", "./snapshot.js", "./portal.js", "./icons.js", "./brand-bac.svg", "./brand-multimoney.svg", "./brand-binance.ico", "./icon.png", "./icon-512.png", "./apple-touch-icon.png"].map(path => new URL(path, self.registration.scope).href);
const INDEX = new URL('./index.html', self.registration.scope).href;
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('dex-pages-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    url.hash = '';
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope) || event.request.headers.has('Authorization')) return;
    if (event.request.mode === 'navigate' && !url.pathname.endsWith('/privacy.html')) {
        event.respondWith(caches.match(INDEX, {cacheName: CACHE}).then(cached => cached || fetch(event.request)));
        return;
    }
    if (SHELL.includes(url.href)) {
        event.respondWith(caches.match(url.href, {cacheName: CACHE}).then(cached => cached || fetch(event.request)));
        return;
    }
    if (/\.png$/.test(url.pathname)) {
        event.respondWith(caches.open(IMAGES).then(cache => cache.match(url.href).then(cached => cached || fetch(event.request).then(response => {
            if (response.ok) cache.put(url.href, response.clone());
            return response;
        }))));
    }
});
