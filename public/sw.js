const CACHE_NAME = 'fittrack-v1.6';
const STATIC_ASSETS = [
  '/manifest.json',
];

// Install — cache only manifest, not HTML pages
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — delete ALL old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - Supabase / API calls → network-first, no cache fallback
// - HTML pages (/, /dashboard) → network-first, no cache (always fresh)
// - Static assets (_next/static) → cache-first (content-hashed, safe to cache long-term)
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Network-only: Supabase, API routes, Clerk
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('clerk') ||
    url.pathname.startsWith('/api/')
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache-first: Next.js hashed static assets (safe — filenames change each deploy)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first: HTML pages — always fetch fresh, fall back to cache only if offline
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }
});
