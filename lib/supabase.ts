import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser Supabase client that injects the Clerk session JWT.
 * Call once per component tree via useMemo or the store.
 */
export function createSupabaseClient(getToken: () => Promise<string | null>): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
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
