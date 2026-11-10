/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';
import { NetworkFirst, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/** App routes that must open offline. Kept in sync with app/(app)/*. */
const APP_ROUTES = ['/today', '/program', '/history', '/settings'];
const SHELL_CACHE = 'app-shell';
const SHELL_RSC_CACHE = 'app-shell-rsc';

const isAppRoute = (pathname: string) => APP_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));

// App shell: network-first with a short timeout and NO expiry, so the app still
// opens after days offline (Serwist's defaults expire pages after 24 h).
const appShell: RuntimeCaching[] = [
  {
    matcher: ({ request, url, sameOrigin }) => sameOrigin && request.headers.get('RSC') === '1' && isAppRoute(url.pathname),
    handler: new NetworkFirst({ cacheName: SHELL_RSC_CACHE, networkTimeoutSeconds: 3 }),
  },
  {
    matcher: ({ request, url, sameOrigin }) => sameOrigin && request.mode === 'navigate' && isAppRoute(url.pathname),
    handler: new NetworkFirst({ cacheName: SHELL_CACHE, networkTimeoutSeconds: 3 }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...appShell, ...defaultCache],
  fallbacks: {
    entries: [{ url: '/~offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

/**
 * Warm the app-shell cache with every app route (signed-in cookies go along),
 * so a route the user hasn't visited yet still opens in airplane mode.
 */
async function warmAppShell(): Promise<void> {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    APP_ROUTES.map(async (path) => {
      try {
        const res = await fetch(path, { credentials: 'same-origin', redirect: 'follow' });
        // Signed out → middleware redirects to sign-in: don't cache that as the shell.
        if (res.ok && !res.redirected) await cache.put(path, res);
      } catch {
        /* offline: keep what we have */
      }
    }),
  );
}

self.addEventListener('install', (event) => event.waitUntil(warmAppShell()));
self.addEventListener('message', (event) => {
  if (event.data?.type === 'WARM_APP_SHELL') event.waitUntil(warmAppShell());
});

// ─── Web push (kept from v1) ──────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; tag?: string; url?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'FitTrack', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'FitTrack', {
      body: payload.body ?? '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: payload.tag ?? 'fittrack',
      data: { url: payload.url ?? '/today' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? '/today';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return (c as WindowClient).focus();
      return self.clients.openWindow(url);
    }),
  );
});

serwist.addEventListeners();
