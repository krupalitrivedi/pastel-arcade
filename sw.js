// Pixel Party service worker: after one visit with internet, the whole site
// (page, games, Offline Protocol engine, QR tools, fonts) loads with none.
//
// Every file is cached under one VERSION, so a cache is always one complete
// build. A new version never takes over a running page by itself: the page
// shows "update" and reloads once the person taps it (see app.js).
//
// >>> Bump VERSION whenever any file of the site changes, or visitors keep the old build. <<<
const VERSION = '2026-11-22.3';
const CACHE = `pixel-party-${VERSION}`;
const FONTS = 'pixel-party-fonts';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=DynaPuff:wght@400;700&family=Pixelify+Sans:wght@400;700&family=Rubik+Bubbles&family=Shrikhand&family=Silkscreen&family=VT323&display=swap';

const SDK = './vendor/offline-protocol/';
const ASSETS = [
  './',
  './style.css',
  './app.js',
  './net.js',
  './games/common.js',
  './games/memory-duel.js',
  './games/paddle-duel.js',
  './manifest.webmanifest',
  './assets/logo.svg',
  './assets/icon-180.png',
  './assets/icon-512.png',
  './vendor/qr/qrcode.js',
  './vendor/qr/jsQR.js',
  ...['bluetooth', 'direct-code', 'index', 'nearby', 'nostr-relays', 'nostr-signal',
    'store', 'tab-carrier', 'webrtc', 'worker'].map((f) => `${SDK}src/${f}.js`),
  `${SDK}pkg/offline_protocol_web.js`,
  `${SDK}pkg/offline_protocol_web_bg.wasm`,
];

// Fonts come from Google, so they are cached too: the stylesheet, then every
// font file it names. Best effort: without them the site still works, in fallback fonts.
async function cacheFonts() {
  try {
    const cache = await caches.open(FONTS);
    const res = await fetch(FONT_CSS, { mode: 'cors' });
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
    await Promise.all(urls.map(async (u) => {
      if (await cache.match(u)) return;
      const f = await fetch(u, { mode: 'cors' });
      if (f.ok) await cache.put(u, f);
    }));
  } catch { /* offline or blocked: skip */ }
}

self.addEventListener('install', (event) => {
  // addAll fails whole if one file fails; "reload" skips the HTTP cache so
  // the engine's JS glue and .wasm always come from the same build.
  event.waitUntil(Promise.all([
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))),
    cacheFonts(),
  ]));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((k) => k.startsWith('pixel-party-') && k !== CACHE && k !== FONTS)
    .map((k) => caches.delete(k)))));
});

// The page's "update" button.
self.addEventListener('message', (event) => {
  if (event.data === 'activate') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Google Fonts: cached copy first, refreshed in the background when online.
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(caches.open(FONTS).then(async (cache) => {
      const hit = await cache.match(request);
      const fresh = fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res; }).catch(() => hit);
      return hit || fresh;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // The page itself, with any query (?profile=p2), is always this build's cached page.
  const page = request.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
  event.respondWith(caches.open(CACHE).then(async (cache) =>
    (await cache.match(page ? './' : request, { ignoreSearch: page })) ?? fetch(request)));
});
