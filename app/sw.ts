/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';
import { NetworkFirst, NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/** App routes that must open offline. Kept in sync with app/(app)/*. */
const APP_ROUTES = ['/today', '/strength', '/history', '/settings'];
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

// Exercise videos: never precache or runtime-cache YouTube (thumbnails, embeds).
// They load only when the user taps, and the sheet says they need a connection.
const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com)$/;
const thirdPartyVideo: RuntimeCaching[] = [
  { matcher: ({ url }) => YOUTUBE_HOST.test(url.hostname), handler: new NetworkOnly() },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...thirdPartyVideo, ...appShell, ...defaultCache],
  fallbacks: {
    entries: [{ url: '/~offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

/**
 * Warm the app-shell cache with every app route (no sign-in, so every route is cacheable),
 * so a route the user hasn't visited yet still opens in airplane mode.
 */
async function warmAppShell(): Promise<void> {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    APP_ROUTES.map(async (path) => {
      try {
        const res = await fetch(path, { credentials: 'same-origin', redirect: 'follow' });
        // Don't cache error pages or redirects as the shell.
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
  // Always show something: iOS can drop a push subscription after "silent"
  // pushes, so a malformed payload (null, a bare string) still notifies.
  let payload: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    const parsed: unknown = event.data ? event.data.json() : null;
    if (parsed && typeof parsed === 'object') payload = parsed as typeof payload;
    else if (typeof parsed === 'string') payload = { body: parsed };
  } catch {
    payload = { body: event.data?.text() };
  }
  const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined);
  payload = {
    title: str(payload.title, 80),
    body: str(payload.body, 240),
    tag: str(payload.tag, 64),
    url: typeof payload.url === 'string' && /^\/(?!\/)/.test(payload.url) ? payload.url : '/today',
  };
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
      // Same-origin paths only; bring an open window to the notification's page.
      const target = /^\/(?!\/)/.test(url) ? url : '/today';
      for (const c of list) {
        const w = c as WindowClient;
        // Focus first (inside the click's user activation), then move to the page.
        if ('focus' in w)
          return w
            .focus()
            .then((f) => (f.url.endsWith(target) ? f : f.navigate(target).catch(() => f)))
            .catch(() => self.clients.openWindow(target));
      }
      return self.clients.openWindow(target);
    }),
  );
});

serwist.addEventListeners();
