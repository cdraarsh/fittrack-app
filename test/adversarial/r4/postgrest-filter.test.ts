// @vitest-environment node
/**
 * Adversarial r4: the cron's 404/410 delete uses .eq('subscription->>endpoint', …)
 * on a jsonb column. Build the real supabase-js request (no network: custom fetch)
 * and check the PostgREST query string.
 */
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

describe('PostgREST jsonb filter for the gone-endpoint delete', () => {
  it('holds: subscription->>endpoint=eq.<endpoint> with the exact (encoded) endpoint', async () => {
    const urls: string[] = [];
    const methods: string[] = [];
    const db = createClient('http://127.0.0.1:54321', 'svc', {
      auth: { persistSession: false },
      global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          urls.push(String(input));
          methods.push(init?.method ?? 'GET');
          return new Response(null, { status: 204 });
        },
      },
    });
    const endpoint = 'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAC%2b9a,x(y)&z=1';
    await db.from('ft_push_subscriptions').delete().eq('user_id', 'owner').eq('subscription->>endpoint', endpoint);
    const u = new URL(urls[0]);
    expect(methods[0]).toBe('DELETE');
    expect(u.pathname).toBe('/rest/v1/ft_push_subscriptions');
    expect(u.searchParams.get('user_id')).toBe('eq.owner');
    expect(u.searchParams.get('subscription->>endpoint')).toBe(`eq.${endpoint}`);
  });
});
