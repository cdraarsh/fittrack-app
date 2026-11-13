/** Web Push (VAPID) subscription body, as produced by PushSubscription.toJSON(). */
export interface WebPushBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** A real browser push endpoint: https, sane size, base64url keys. The cron POSTs to it. */
export function validSubscription(b: unknown): b is WebPushBody {
  if (!b || typeof b !== 'object') return false;
  const { endpoint, keys } = b as Partial<WebPushBody>;
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false;
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.port !== '' || !isPushServiceHost(u.hostname)) return false;
  const b64 = /^[A-Za-z0-9_-]{8,256}={0,2}$/;
  return !!keys && typeof keys.p256dh === 'string' && typeof keys.auth === 'string' && b64.test(keys.p256dh) && b64.test(keys.auth);
}


/** Browser push services (Apple, Google/FCM, Mozilla, Microsoft). The cron POSTs only there. */
const PUSH_HOST_SUFFIXES = ['push.apple.com', 'fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com'];

export function isPushServiceHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return PUSH_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}
