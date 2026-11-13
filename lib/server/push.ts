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
  if (u.protocol !== 'https:' || /^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(u.hostname)) return false;
  const b64 = /^[A-Za-z0-9_-]{8,256}={0,2}$/;
  return !!keys && typeof keys.p256dh === 'string' && typeof keys.auth === 'string' && b64.test(keys.p256dh) && b64.test(keys.auth);
}

