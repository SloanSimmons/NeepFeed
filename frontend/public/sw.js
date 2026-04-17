/* NeepFeed service worker.
 *
 * Strategies:
 *   - App shell (HTML, JS bundles, CSS, icons, manifest): cache-first with
 *     network fallback on miss. Deployed bundles are hashed, so stale
 *     cache is not a correctness problem.
 *   - /api/*: network-first with stale fallback. Previously this was
 *     stale-while-revalidate, but for mutable endpoints (add a sub, save
 *     a skin, change settings, (un)bookmark) that showed the user stale
 *     state until the background revalidate landed, making mutations
 *     appear to fail. Network-first keeps the instant-paint offline
 *     fallback while guaranteeing fresh data online.
 *   - Images (thumbnails, picsum, i.redd.it, etc.): cache-first with a
 *     120-entry LRU-style trim.
 *   - Everything else: let the network handle it.
 *
 * Bump VERSION to purge old caches.
 */
const VERSION = 'v2';
const SHELL_CACHE = `nf-shell-${VERSION}`;
const API_CACHE = `nf-api-${VERSION}`;
const IMG_CACHE = `nf-img-${VERSION}`;
const IMG_CACHE_LIMIT = 120;

const SHELL_PRECACHE = ['/', '/manifest.json', '/favicon.svg', '/skin-template.md'];

// Network-only paths (cheap, always fresh, not worth caching):
const API_NO_CACHE_PREFIXES = ['/api/health', '/api/stats', '/api/collect'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, API_CACHE, IMG_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

async function networkFirstApi(req) {
  const cache = await caches.open(API_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const cached = await cache.match(req);
    if (cached) return cached;
    // No cache, no network: surface a synthetic 503 with a JSON body so
    // the frontend's error path gets a parseable response instead of a
    // network error.
    return new Response(
      JSON.stringify({ error: 'offline', cached: false }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirstImage(req) {
  const cache = await caches.open(IMG_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      cache.put(req, res.clone()).catch(() => {});
      trimCache(IMG_CACHE, IMG_CACHE_LIMIT).catch(() => {});
    }
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}

async function cacheFirstShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    // Offline SPA fallback: serve root shell for navigations.
    return (await cache.match('/')) || Response.error();
  }
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  for (let i = 0; i < keys.length - max; i++) {
    cache.delete(keys[i]).catch(() => {});
  }
}

function isShellRequest(req, url) {
  if (req.mode === 'navigate') return true;
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname === '/' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/icon-maskable.svg' ||
    url.pathname === '/skin-template.md' ||
    url.pathname.startsWith('/assets/')
  );
}

function isImageRequest(req, url) {
  if (req.destination === 'image') return true;
  const p = url.pathname.toLowerCase();
  return /\.(png|jpe?g|webp|gif|avif|svg)$/.test(p);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Known no-cache API paths
  if (API_NO_CACHE_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    return; // default network behavior
  }

  // All other /api/* GETs are network-first on same origin
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstApi(req));
    return;
  }

  if (isImageRequest(req, url)) {
    event.respondWith(cacheFirstImage(req));
    return;
  }

  if (isShellRequest(req, url)) {
    event.respondWith(cacheFirstShell(req));
    return;
  }

  // Default: let it hit network.
});
