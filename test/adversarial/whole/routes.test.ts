// @vitest-environment node
/**
 * Adversarial whole-app pass: server routes. A FAILING test = a defect.
 * No network: Supabase, web-push and AI are mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────
const sendNotification = vi.fn(async () => ({}));
const setVapidDetails = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification, setVapidDetails } }));

type Tbl = Record<string, unknown[]>;
let tables: Tbl = {};
const upserts: { table: string; row: unknown }[] = [];
const fromCalls: string[] = [];
function q(table: string) {
  const chain: Record<string, unknown> = {};
  const result = () => Promise.resolve({ data: tables[table] ?? [], error: null });
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'gte', 'lte', 'delete']) chain[m] = () => chain;
  chain.upsert = (row: unknown) => {
    upserts.push({ table, row });
    return Promise.resolve({ error: null });
  };
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => result().then(res, rej);
  return chain;
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t: string) => {
      fromCalls.push(t);
      return q(t);
    },
  }),
}));

const ENV = { ...process.env };
beforeEach(() => {
  tables = {};
  upserts.length = 0;
  fromCalls.length = 0;
  sendNotification.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  process.env.VAPID_EMAIL = 'mailto:x@example.com';
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
});
afterEach(() => {
  process.env = { ...ENV };
  vi.useRealTimers();
});

const sub = { user_id: 'owner', subscription: { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } } };

describe('cron/reminders', () => {
  it('rejects every caller when CRON_SECRET is unset (no "Bearer undefined" bypass)', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/reminders/route');
    const res = await GET(new NextRequest('http://x/api/cron/reminders', { headers: { authorization: 'Bearer undefined' } }));
    expect(res.status).toBe(401);
  });

  it('does not tell the owner "your next session is up" without even looking at the program', async () => {
    process.env.CRON_SECRET = 's3cret';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T07:00:00Z')); // Monday
    tables = {
      ft_push_subscriptions: [sub],
      user_settings: [{ user_id: 'owner', preferred_days: [1], timezone: 'UTC' }],
    };
    const { GET } = await import('@/app/api/cron/reminders/route');
    await GET(new NextRequest('http://x/api/cron/reminders', { headers: { authorization: 'Bearer s3cret' } }));
    // The payload claims a session is up next. The route never reads programs /
    // program_sessions, so it fires on a finished block, a locked day, or a day already trained.
    expect(fromCalls.some((t) => t === 'program_sessions' || t === 'programs')).toBe(true);
  });

  it('fires at a sane local hour (fixed 07:00 UTC schedule ignores the owner time zone)', async () => {
    process.env.CRON_SECRET = 's3cret';
    vi.useFakeTimers({ toFake: ['Date'] });
    // Tue 07:00 UTC = Mon 23:00 in Los Angeles. Preferred day Monday.
    vi.setSystemTime(new Date('2026-11-17T07:00:00Z'));
    tables = {
      ft_push_subscriptions: [sub],
      user_settings: [{ user_id: 'owner', preferred_days: [1], timezone: 'America/Los_Angeles' }],
    };
    const { GET } = await import('@/app/api/cron/reminders/route');
    const res = await GET(new NextRequest('http://x/api/cron/reminders', { headers: { authorization: 'Bearer s3cret' } }));
    const body = await res.json();
    // A "Time to train" push at 11 pm on Monday night is not a training-day reminder.
    expect(body.sent).toBe(0);
  });
});

describe('push/subscribe', () => {
  it('returns 400 (not an unhandled throw / 500) for a malformed body', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route');
    let status: number | null = null;
    try {
      const res = await POST(new NextRequest('http://x/api/push/subscribe', { method: 'POST', body: '{not json' }));
      status = res.status;
    } catch {
      status = -1; // handler threw → Next renders a generic 500
    }
    expect(status).toBe(400);
  });

  it('refuses a non-https push endpoint (the cron would POST to any URL it is given)', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route');
    const res = await POST(
      new NextRequest('http://x/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: 'http://169.254.169.254/latest/meta-data', keys: { p256dh: 'p', auth: 'a' } }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
