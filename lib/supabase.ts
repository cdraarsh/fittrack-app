import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** A request that never answers (signal lost mid-request) must not freeze sync. */
const TOKEN_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 20_000;

function withTimeout(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal;
}

// Cached by elapsed time (performance.now), not the device clock, so a phone
// with a wrong clock doesn't refetch the token before every request.
let cached: { token: string; validUntil: number } | null = null;
let inflight: Promise<string | null> | null = null;

/** Browser: the owner's Supabase JWT from /api/token, cached until a minute before expiry. */
export function getOwnerToken(): Promise<string | null> {
  if (cached && cached.validUntil > performance.now()) return Promise.resolve(cached.token);
  inflight ??= fetch('/api/token', { cache: 'no-store', signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS) })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as { token: string; expiresIn: number };
      cached = { token: body.token, validUntil: performance.now() + Math.max(0, body.expiresIn - 60) * 1000 };
      return cached.token;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Browser Supabase client that injects the owner JWT, so RLS applies. */
export function createSupabaseClient(getToken: () => Promise<string | null> = getOwnerToken): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, options = {}) => {
        const init = options as RequestInit;
        const token = await getToken();
        const headers = new Headers(init.headers);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return fetch(url, { ...init, headers, signal: withTimeout(init.signal, REQUEST_TIMEOUT_MS) });
      },
    },
  });
}
