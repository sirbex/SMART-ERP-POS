/**
 * Service Worker for SMART-ERP-POS
 *
 * Caching strategies:
 *   - Static assets (JS, CSS, images):  CacheFirst
 *   - App shell / navigation:           NetworkFirst → cached shell → offline page
 *   - API GET requests (products, inventory, customers): NetworkFirst → cache fallback
 *   - API mutations (POST/PUT/DELETE):  NetworkOnly (handled by offline queue in app)
 *
 * The SW never intercepts POST/PUT/DELETE since the app's useOfflineMode hook
 * already queues those locally and syncs on reconnect.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `pos-static-${CACHE_VERSION}`;
const API_CACHE = `pos-api-${CACHE_VERSION}`;
const APP_SHELL_CACHE = `pos-shell-${CACHE_VERSION}`;

// API routes we want to cache for offline use (GET only)
const CACHEABLE_API_PATTERNS = [
  '/api/products',
  '/api/inventory/stock-levels',
  '/api/inventory/batches',
  '/api/customers',
  '/api/uom',
  '/api/settings',
  '/api/invoice-settings',
];

// Max age for API cache entries (15 minutes)
const API_CACHE_MAX_AGE = 15 * 60 * 1000;

// ── Install ───────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  // Skip waiting so new SW activates immediately
  self.skipWaiting();

  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      // Cache the offline fallback page
      return cache.addAll([
        './offline.html',
      ]);
    })
  );
});

// ── Activate ──────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => {
            return (
              key !== STATIC_CACHE &&
              key !== API_CACHE &&
              key !== APP_SHELL_CACHE
            );
          })
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET requests (mutations handled by app offline queue)
  if (request.method !== 'GET') return;

  // ── API requests: NetworkFirst with cache fallback ─────────
  if (url.pathname.startsWith('/api/')) {
    if (isCacheableApiRoute(url.pathname)) {
      event.respondWith(networkFirstApi(request));
    }
    // Non-cacheable API routes: let browser handle normally
    return;
  }

  // ── Static assets (JS, CSS, images, fonts): CacheFirst ─────
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStatic(request));
    return;
  }

  // ── Navigation requests: NetworkFirst → cached → offline ──
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
});

// ── Strategy: NetworkFirst for API ────────────────────────────
async function networkFirstApi(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      // Clone and store with timestamp header
      const cloned = response.clone();
      const headers = new Headers(cloned.headers);
      headers.set('sw-cache-time', Date.now().toString());
      const body = await cloned.blob();
      const cachedResponse = new Response(body, {
        status: cloned.status,
        statusText: cloned.statusText,
        headers,
      });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    // Network failed — serve from cache
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // Return empty JSON response so the app doesn't crash
    return new Response(
      JSON.stringify({ success: false, error: 'Offline — serving cached data', data: null }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ── Strategy: CacheFirst for static assets ────────────────────
async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Static asset unavailable — return empty response
    return new Response('', { status: 503 });
  }
}

// ── Strategy: NetworkFirst for navigation ─────────────────────
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try cached version of any navigated page (SPA — index.html)
    const cached = await caches.match(request);
    if (cached) return cached;

    // Try the root index (SPA fallback)
    const rootCached = await caches.match('./');
    if (rootCached) return rootCached;

    // Last resort: offline page
    const offlinePage = await caches.match('./offline.html');
    if (offlinePage) return offlinePage;

    return new Response('Offline', { status: 503 });
  }
}

// ── Helpers ───────────────────────────────────────────────────
function isCacheableApiRoute(pathname) {
  return CACHEABLE_API_PATTERNS.some((pattern) => pathname.startsWith(pattern));
}

function isStaticAsset(pathname) {
  return /\.(js|css|woff2?|ttf|png|jpg|jpeg|gif|svg|ico|webp)(\?.*)?$/.test(pathname);
}

// ── Message handling ──────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  // Allow the app to trigger API cache pre-warming
  if (event.data?.type === 'CACHE_API_ROUTES') {
    const routes = event.data.routes || CACHEABLE_API_PATTERNS;
    event.waitUntil(prewarmApiCache(routes));
  }

  // Allow clearing API cache
  if (event.data?.type === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

async function prewarmApiCache(routes) {
  const cache = await caches.open(API_CACHE);
  for (const route of routes) {
    try {
      const response = await fetch(route);
      if (response.ok) {
        cache.put(route, response);
      }
    } catch {
      // Silently skip routes that fail
    }
  }
}
