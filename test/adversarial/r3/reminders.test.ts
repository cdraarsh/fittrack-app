// @vitest-environment node
/**
 * Adversarial r3: /api/cron/reminders rewrite, push subscribe validation, cron auth.
 * Supabase and web-push are mocked with a mock that APPLIES eq/in filters.
 * A FAILING test = a defect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const sendNotification = vi.fn(async (..._a: unknown[]) => ({}));
const setVapidDetails = vi.fn();
vi.mock('web-push', () => ({ default: { sendNotification, setVapidDetails } }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
const deletes: { table: string; filters: [string, unknown][] }[] = [];
const upserts: { table: string; row: unknown }[] = [];
function q(table: string) {
  const filters: [string, (r: Row) => boolean][] = [];
  const eqs: [string, unknown][] = [];
  let del = false;
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.order = () => chain;
  chain.limit = () => chain;
  chain.eq = (c: string, v: unknown) => (eqs.push([c, v]), filters.push([c, (r) => r[c] === v]), chain);
  chain.in = (c: string, vs: unknown[]) => (filters.push([c, (r) => vs.includes(r[c])]), chain);
  chain.delete = () => ((del = true), chain);
  chain.upsert = (row: unknown) => (upserts.push({ table, row }), Promise.resolve({ error: null }));
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    if (del) {
      deletes.push({ table, filters: eqs });
      return Promise.resolve({ data: null, error: null }).then(res, rej);
    }
    const data = (tables[table] ?? []).filter((r) => filters.every(([, f]) => f(r)));
    data.sort((a, b) => Number(a.seq ?? 0) - Number(b.seq ?? 0));
    return Promise.resolve({ data, error: null }).then(res, rej);
  };
  return chain;
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => q(t) }) }));

const ENV = { ...process.env };
beforeEach(() => {
  tables = {};
  deletes.length = 0;
  upserts.length = 0;
  sendNotification.mockReset();
  sendNotification.mockImplementation(async () => ({}));
  process.env.CRON_SECRET = 'cron';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
  process.env.VAPID_EMAIL = 'owner@example.com';
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub';
  process.env.VAPID_PRIVATE_KEY = 'priv';
});
afterEach(() => {
  process.env = { ...ENV };
  vi.useRealTimers();
});

const cronReq = () => new NextRequest('http://localhost/api/cron/reminders', { headers: { authorization: 'Bearer cron' } });
const sub = { user_id: 'owner', push_type: 'web', subscription: { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } } };
// Tue 2026-11-17 01:30 UTC = 07:00 IST (vercel.json schedule).
const TUE_0130Z = new Date('2026-11-17T01:30:00Z');
const settings = { user_id: 'owner', preferred_days: [1, 2, 4, 5], timezone: 'Asia/Kolkata', unlock_rule: 'next_calendar_day' };

async function runCron(now: Date) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const { GET } = await import('@/app/api/cron/reminders/route');
  const res = await GET(cronReq());
  return (await res.json()) as { sent: number };
}

describe('cron/reminders: which session is waiting', () => {
  it('reminds the morning after a training day (next session is unlocked by the calendar, but still "locked" in the DB)', async () => {
    // Mon: session 5 completed (complete_session → _refresh_unlocks: same day → 6 stays locked).
    // Nothing calls refresh_unlocks overnight; the phone is asleep at 07:00 Tue.
    tables = {
      ft_push_subscriptions: [sub],
      user_settings: [settings],
      programs: [{ id: 'p1', user_id: 'owner', status: 'active' }],
      program_sessions: [
        { user_id: 'owner', program_id: 'p1', seq: 5, title: 'Lower', template_key: 'lower_a', status: 'complete', completed_at: '2026-11-16T13:00:00Z' },
        { user_id: 'owner', program_id: 'p1', seq: 6, title: 'Upper', template_key: 'upper_b', status: 'locked', completed_at: null },
      ],
    };
    const body = await runCron(TUE_0130Z);
    expect(body.sent).toBe(1);
  });

  it('does not remind about an archived program (active block finished, old block has an up_next row)', async () => {
    tables = {
      ft_push_subscriptions: [sub],
      user_settings: [settings],
      programs: [
        { id: 'old', user_id: 'owner', status: 'archived' },
        { id: 'new', user_id: 'owner', status: 'complete' },
      ],
      program_sessions: [
        { user_id: 'owner', program_id: 'old', seq: 12, title: 'Upper', template_key: 'upper_a', status: 'up_next' },
        { user_id: 'owner', program_id: 'new', seq: 64, title: 'Lower', template_key: 'lower_b', status: 'complete' },
      ],
    };
    const body = await runCron(TUE_0130Z);
    expect(body.sent).toBe(0); // the UI offers "Start next block"; the push says "Day 4 · … is up next"
  });

  it('prefers the active program over an archived one with a lower seq', async () => {
    tables = {
      ft_push_subscriptions: [sub],
      user_settings: [settings],
      programs: [
        { id: 'old', user_id: 'owner', status: 'archived' },
        { id: 'new', user_id: 'owner', status: 'active' },
      ],
      program_sessions: [
        { user_id: 'owner', program_id: 'old', seq: 2, title: 'Upper', template_key: 'upper_b', status: 'in_progress' },
        { user_id: 'owner', program_id: 'new', seq: 9, title: 'Lower', template_key: 'lower_a', status: 'up_next' },
      ],
    };
    await runCron(TUE_0130Z);
    const payload = JSON.parse(String(sendNotification.mock.calls[0]?.[1] ?? '{}')) as { title?: string };
    expect(payload.title).toBe('Time to train'); // not "Finish your session" for the dead block
  });

  it('holds: prefixes a bare VAPID email with mailto:', async () => {
    tables = {
      ft_push_subscriptions: [sub],
      user_settings: [settings],
      program_sessions: [{ user_id: 'owner', program_id: 'p1', seq: 6, title: 'Upper', template_key: 'upper_b', status: 'up_next' }],
    };
    await runCron(TUE_0130Z);
    expect(setVapidDetails.mock.calls.at(-1)?.[0]).toBe('mailto:owner@example.com');
  });

  it('holds: 410 Gone removes the subscription, other errors keep it', async () => {
    tables = {
      ft_push_subscriptions: [sub],
      user_settings: [settings],
      programs: [{ id: 'p1', user_id: 'owner', status: 'active' }],
      program_sessions: [{ user_id: 'owner', program_id: 'p1', seq: 6, title: 'Upper', template_key: 'upper_b', status: 'up_next' }],
    };
    sendNotification.mockImplementationOnce(async () => {
      throw Object.assign(new Error('gone'), { statusCode: 410 });
    });
    await runCron(TUE_0130Z);
    expect(deletes).toHaveLength(1);
    // ...and only that exact endpoint, so a subscription re-saved since the SELECT survives.
    expect(deletes[0].filters.map(([c]) => c)).toEqual(['user_id', 'subscription->>endpoint']);
  });

  it('holds: outside the 06–11 local window nothing is sent; missing env is a no-op', async () => {
    tables = {
      ft_push_subscriptions: [sub],
      user_settings: [{ ...settings, timezone: 'Asia/Dubai' }], // 05:30 local
      programs: [{ id: 'p1', user_id: 'owner', status: 'active' }],
      program_sessions: [{ user_id: 'owner', program_id: 'p1', seq: 6, title: 'Upper', template_key: 'upper_b', status: 'up_next' }],
    };
    expect((await runCron(TUE_0130Z)).sent).toBe(0);
    delete process.env.VAPID_PRIVATE_KEY;
    const { GET } = await import('@/app/api/cron/reminders/route');
    expect(await (await GET(cronReq())).json()).toMatchObject({ skipped: true });
  });
});

describe('push/subscribe validation', () => {
  const p256dh = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'; // 87
  const auth = 'tBHItJI5svbpez7KI4CCXg'; // 22
  const endpoints = [
    'https://web.push.apple.com/QGuQyavXutnMH2uPzIvbuR3hEb8a8nhBwP-fXJ4K9C1bYK3pD6VpWg5Q8V7Iqt5sTqQk9F1ZbHb6M3lJ8uX5c0Vg',
    'https://fcm.googleapis.com/fcm/send/dpH5lCsTSSM:APA91bHqjZxM0VImWWqDRN7U0a3AycjUf4O-byuxb_wJsKRaKvV_iKw56s16ekq6FUqoCF7k2nICUpd8fHPxVTgqLunFeVeB9lLCQZyohyAztTH8ZQL9WCxKpA6dvTG_TUIhQUFq_n',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABhZ0aGo1K8gJnJYQ6L9d2pfIvbz9z3Xfo3Q6t0W4hHq2l8sYp0lD9Jq7k0h5d8VYzR8kP1z3Q0jK6hL4nP2rT6vX8zB1cD3eF5gH7iJ9kL0mN2oP4qR6sT8uV0wX2yZ4aB6cD8eF0gH2iJ4kL6mN8oP0qR2sT4uV6wX8yZ0aB2cD4eF6gH8iJ0kL2mN4oP6qR8sT0uV2wX4yZ6aB8cD0eF2gH4iJ6kL8mN0oP2qR4sT6uV8wX0yZ2',
  ];
  it('holds: real Apple / FCM / Mozilla subscriptions pass', async () => {
    const { validSubscription } = await import('@/lib/server/push');
    for (const endpoint of endpoints) expect(validSubscription({ endpoint, keys: { p256dh, auth } }), endpoint).toBe(true);
  });

  it('rejects loopback / internal hosts the cron would POST to', async () => {
    const { validSubscription } = await import('@/lib/server/push');
    for (const host of ['localhost.', 'foo.localhost', 'metadata.google.internal']) {
      expect(validSubscription({ endpoint: `https://${host}/x`, keys: { p256dh, auth } }), host).toBe(false);
    }
  });

  it('holds: text/plain and form posts are refused with 415, JSON is stored with only endpoint+keys', async () => {
    const { POST } = await import('@/app/api/push/subscribe/route');
    const body = JSON.stringify({ endpoint: endpoints[0], keys: { p256dh, auth }, expirationTime: null, extra: 'x' });
    const plain = await POST(new NextRequest('http://localhost/api/push/subscribe', { method: 'POST', body, headers: { 'content-type': 'text/plain;charset=UTF-8' } }));
    expect(plain.status).toBe(415);
    const ok = await POST(new NextRequest('http://localhost/api/push/subscribe', { method: 'POST', body, headers: { 'content-type': 'application/json' } }));
    expect(ok.status).toBeLessThan(300);
    expect(upserts.at(-1)?.row).toMatchObject({ subscription: { endpoint: endpoints[0], keys: { p256dh, auth } } });
  });
});

describe('cron auth', () => {
  it('holds: exact bearer only, no secret = nobody', async () => {
    const { isCronAuthorized } = await import('@/lib/server/cronAuth');
    expect(isCronAuthorized('Bearer s', 's')).toBe(true);
    expect(isCronAuthorized('bearer s', 's')).toBe(false);
    expect(isCronAuthorized('Bearer s ', 's')).toBe(false);
    expect(isCronAuthorized('Bearer ', '')).toBe(false);
    expect(isCronAuthorized('Bearer undefined', undefined)).toBe(false);
  });
});
