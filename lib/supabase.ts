import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let cached: { token: string; expiresAt: number } | null = null;
let inflight: Promise<string | null> | null = null;

/** Browser: the owner's Supabase JWT from /api/token, cached until a minute before expiry. */
export function getOwnerToken(): Promise<string | null> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) return Promise.resolve(cached.token);
  inflight ??= fetch('/api/token', { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return null;
      cached = (await res.json()) as { token: string; expiresAt: number };
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
        const token = await getToken();
        const headers = new Headers((options as RequestInit).headers);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return fetch(url, { ...(options as RequestInit), headers });
      },
    },
  });
}
