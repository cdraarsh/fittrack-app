// ─── Server-side Supabase client for AI routes ───────────────────────────────
// Same pattern as lib/supabase.ts (owner JWT injected per request, so RLS via
// public.requesting_user_id() applies), kept separate so the AI track
// doesn't depend on that file's evolving shape. Server-only.

import { mintOwnerToken } from '@/lib/auth/supabaseToken';
import { OWNER_ID } from '@/lib/owner';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createUserSupabase(getToken: () => Promise<string | null>): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Supabase env not configured');
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init = {}) => {
        const token = await getToken();
        const headers = new Headers((init as RequestInit).headers);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return fetch(input, { ...(init as RequestInit), headers });
      },
    },
  });
}

/** The single owner + RLS-scoped Supabase client, or null if the token can't be minted. */
export async function getAuthedSupabase(): Promise<{ userId: string; db: SupabaseClient } | null> {
  try {
    mintOwnerToken();
  } catch {
    return null;
  }
  return { userId: OWNER_ID, db: createUserSupabase(async () => mintOwnerToken().token) };
}
