/**
 * Service Worker for SamplePOS PWA
 * Handles offline caching and background sync
 */

const CACHE_NAME = 'samplepos-v1';
const RUNTIME_CACHE = 'samplepos-runtime-v1';

// Assets to cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/vite.svg',
  '/manifest.json',
];

// API endpoints that should NOT be cached
const NO_CACHE_APIS = [
  '/api/transactions',
  '/api/payments',
  '/api/inventory/update',
];

// ============================================================
// INSTALL EVENT
// ============================================================

self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('✅ Service Worker installed');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('❌ Service Worker install failed:', error);
      })
  );
});

// ============================================================
// ACTIVATE EVENT
// ============================================================

self.addEventListener('activate', (event) => {
  console.log('🔧 Service Worker activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old caches
              return name !== CACHE_NAME && name !== RUNTIME_CACHE;
            })
            .map((name) => {
              console.log(`🗑️ Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('✅ Service Worker activated');
        return self.clients.claim();
      })
  );
});

// ============================================================
// FETCH EVENT
// ============================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // API requests - Network first, then cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // App shell - Cache first, then network
  event.respondWith(cacheFirst(request));
});

// ============================================================
// CACHING STRATEGIES
// ============================================================

/**
 * Cache-first strategy
 * Good for static assets
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    console.log(`📦 Serving from cache: ${request.url}`);
    return cached;
  }

  try {
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.error(`❌ Fetch failed for ${request.url}:`, error);
    
    // Return offline page if available
    const offlinePage = await cache.match('/index.html');
    return offlinePage || new Response('Offline', { status: 503 });
  }
}

/**
 * Network-first strategy
 * Good for API calls
 */
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const url = new URL(request.url);
  
  // Don't cache certain endpoints
  const shouldNotCache = NO_CACHE_APIS.some(api => url.pathname.includes(api));

  try {
    const response = await fetch(request);
    
    // Cache successful GET responses (except blacklisted ones)
    if (response.ok && request.method === 'GET' && !shouldNotCache) {
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.warn(`⚠️ Network failed for ${request.url}, trying cache...`);
    
    const cached = await cache.match(request);
    
    if (cached) {
      console.log(`📦 Serving stale data from cache: ${request.url}`);
      return cached;
    }

    // Return error response
    return new Response(
      JSON.stringify({ 
        error: 'Offline', 
        message: 'Unable to fetch data while offline' 
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ============================================================
// BACKGROUND SYNC
// ============================================================

self.addEventListener('sync', (event) => {
  console.log('🔄 Background sync event:', event.tag);
  
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncTransactions());
  }
});

/**
 * Sync offline transactions
 */
async function syncTransactions() {
  console.log('📤 Syncing offline transactions...');
  
  try {
    // Notify all clients to sync
    const clients = await self.clients.matchAll();
    
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_TRANSACTIONS',
        timestamp: Date.now(),
      });
    });
    
    console.log('✅ Sync notification sent to clients');
  } catch (error) {
    console.error('❌ Background sync failed:', error);
    throw error;
  }
}

// ============================================================
// MESSAGES
// ============================================================

self.addEventListener('message', (event) => {
  console.log('📨 Service Worker received message:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      }).then(() => {
        console.log('🗑️ All caches cleared');
        event.ports[0].postMessage({ success: true });
      })
    );
  }

  if (event.data.type === 'GET_CACHE_SIZE') {
    event.waitUntil(
      getCacheSize().then((size) => {
        event.ports[0].postMessage({ size });
      })
    );
  }
});

/**
 * Calculate total cache size
 */
async function getCacheSize() {
  const cacheNames = await caches.keys();
  let totalSize = 0;

  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    
    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }
  }

  return totalSize;
}

// ============================================================
// NOTIFICATIONS
// ============================================================

self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

console.log('🚀 Service Worker loaded');
