/* NeepFeed service worker.
 *
 * Strategies:
 *   - App shell (HTML, JS bundles, CSS, icons, manifest): cache-first,
 *     with network fallback on miss. Deployed bundles are hashed, so
 *     stale cache is not a correctness issue.
 *   - /api/feed, /api/lists, /api/subreddits, /api/settings, /api/skins:
 *     stale-while-revalidate. Instant paint from cache, refresh in bg.
 *   - /api/health, /api/stats, /api/collect/*: network-only (cheap,
 *     always fresh).
 *   - Images (thumbnails, picsum, i.redd.it, etc.) on same origin or
 *     known CDN: cache-first, bounded LRU-style eviction to ~120 entries.
 *   - Everything else: network-only (don't cache third-party surprises).
 *
 * Versioning: bump VERSION to force a full cache purge after schema/
 * cache-contract changes.
 */
const VERSION = 'v1';
const SHELL_CACHE = `nf-shell-${VERSION}`;
const API_CACHE = `nf-api-${VERSION}`;
const IMG_CACHE = `nf-img-${VERSION}`;
const IMG_CACHE_LIMIT = 120;

const SHELL_PRECACHE = ['/', '/manifest.json', '/favicon.svg', '/skin-template.md'];

// SWR-cached API paths (exact or prefix match with trailing slash/?)
const SWR_API_PREFIXES = [
  '/api/feed',
  '/api/lists',
  '/api/subreddits',
  '/api/bookmarks',
  '/api/settings',
  '/api/skins',
  '/api/blocklist',
];

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

function isApiSWR(pathname) {
  return SWR_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'));
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => cached); // offline: return stale
  return cached || network;
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
    // SPA fallback: if we lost network on a deep link, serve root shell
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

  // Known no-cache API paths (health/stats/collect)
  if (url.pathname.startsWith('/api/health') ||
      url.pathname.startsWith('/api/stats') ||
      url.pathname.startsWith('/api/collect')) {
    return; // default network behavior
  }

  if (url.origin === self.location.origin && isApiSWR(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
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
