// @vitest-environment node
/**
 * Adversarial r4: /api/cron/reminders after 3dfc613 (advance() over the active
 * program). Supabase + web-push mocked; the mock APPLIES eq/in filters.
 * A FAILING test = a defect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const sendNotification = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock('web-push', () => ({ default: { sendNotification, setVapidDetails: vi.fn() } }));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
const queries: { table: string; select?: string }[] = [];
function q(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let del = false;
  const entry: { table: string; select?: string } = { table };
  queries.push(entry);
  const chain: Record<string, unknown> = {};
  chain.select = (s: string) => ((entry.select = s), chain);
  chain.order = () => chain;
  chain.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain);
  chain.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), chain);
  chain.delete = () => ((del = true), chain);
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    if (del) return Promise.resolve({ data: null, error: null }).then(res, rej);
    const data = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    return Promise.resolve({ data, error: null }).then(res, rej);
  };
  return chain;
}
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (t: string) => q(t) }) }));

const ENV = { ...process.env };
beforeEach(() => {
  tables = {};
  queries.length = 0;
  sendNotification.mockReset();
  sendNotification.mockImplementation(async () => ({}));
  Object.assign(process.env, {
    CRON_SECRET: 'cron', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'svc',
    VAPID_EMAIL: 'o@example.com', NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv',
  });
});
afterEach(() => {
  process.env = { ...ENV };
  vi.useRealTimers();
});

const sub = (user_id = 'owner') => ({ user_id, push_type: 'web', subscription: { endpoint: `https://web.push.apple.com/${user_id}`, keys: { p256dh: 'p', auth: 'a' } } });
// Tue 2026-11-17 01:30 UTC = 07:00 IST.
const TUE_0130Z = new Date('2026-11-17T01:30:00Z');
const settings = (o: Row = {}) => ({ user_id: 'owner', preferred_days: [0, 1, 2, 3, 4, 5, 6], timezone: 'Asia/Kolkata', unlock_rule: 'next_calendar_day', ...o });
const s = (o: Row) => ({ user_id: 'owner', program_id: 'p1', title: null, template_key: 'upper_a', unlocked_at: null, started_at: null, completed_at: null, ...o });

async function runCron(now = TUE_0130Z) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  const { GET } = await import('@/app/api/cron/reminders/route');
  const res = await GET(new NextRequest('http://localhost/api/cron/reminders', { headers: { authorization: 'Bearer cron' } }));
  return (await res.json()) as { sent: number };
}

describe('cron/reminders: advance() over the active program', () => {
  it('holds: next_calendar_day uses the user zone, not UTC (done 01:00 IST Tue = Mon 19:30Z → still locked at 07:00 IST)', async () => {
    tables = {
      ft_push_subscriptions: [sub()], user_settings: [settings()], programs: [{ id: 'p1', user_id: 'owner', status: 'active' }],
      program_sessions: [s({ id: 'a', seq: 1, status: 'complete', completed_at: '2026-11-16T19:30:00Z' }), s({ id: 'b', seq: 2, status: 'locked' })],
    };
    expect((await runCron()).sent).toBe(0);
  });

  it('holds: done 23:30 IST Mon → unlocked Tue morning', async () => {
    tables = {
      ft_push_subscriptions: [sub()], user_settings: [settings()], programs: [{ id: 'p1', user_id: 'owner', status: 'active' }],
      program_sessions: [s({ id: 'a', seq: 1, status: 'complete', completed_at: '2026-11-16T18:00:00Z' }), s({ id: 'b', seq: 2, status: 'locked' })],
    };
    expect((await runCron()).sent).toBe(1);
  });

  it('holds: unlock_rule null → default; complete row without completed_at stays locked (no false reminder)', async () => {
    tables = {
      ft_push_subscriptions: [sub()], user_settings: [settings({ unlock_rule: null })], programs: [{ id: 'p1', user_id: 'owner', status: 'active' }],
      program_sessions: [s({ id: 'a', seq: 1, status: 'complete', completed_at: null }), s({ id: 'b', seq: 2, status: 'locked' })],
    };
    expect((await runCron()).sent).toBe(0);
  });

  it('holds: settings but no sessions, and sessions but no settings, are no-ops', async () => {
    tables = {
      ft_push_subscriptions: [sub(), sub('u2')], user_settings: [settings()],
      programs: [{ id: 'p1', user_id: 'owner', status: 'active' }, { id: 'p2', user_id: 'u2', status: 'active' }],
      program_sessions: [s({ id: 'x', user_id: 'u2', program_id: 'p2', seq: 1, status: 'up_next' })],
    };
    expect((await runCron()).sent).toBe(0);
  });

  it('holds: two users, each judged on their own active program only', async () => {
    tables = {
      ft_push_subscriptions: [sub(), sub('u2')],
      user_settings: [settings(), settings({ user_id: 'u2', timezone: 'UTC' })],
      programs: [{ id: 'p1', user_id: 'owner', status: 'active' }, { id: 'p2', user_id: 'u2', status: 'active' }, { id: 'p0', user_id: 'u2', status: 'archived' }],
      program_sessions: [
        s({ id: 'a', seq: 1, status: 'up_next' }),
        // u2 at 01:30 UTC is outside the window → nothing for u2
        s({ id: 'b', user_id: 'u2', program_id: 'p2', seq: 1, status: 'up_next' }),
        s({ id: 'c', user_id: 'u2', program_id: 'p0', seq: 1, status: 'in_progress' }),
      ],
    };
    expect((await runCron()).sent).toBe(1);
    expect(String(sendNotification.mock.calls[0][0] && (sendNotification.mock.calls[0][0] as { endpoint: string }).endpoint)).toContain('/owner');
  });

  it('"never on a day already trained": immediate rule, session done at 06:15 IST, cron at 07:00 IST still says "Time to train"', async () => {
    // Route docstring: "Never on a locked day, a finished block, or a day already trained."
    tables = {
      ft_push_subscriptions: [sub()], user_settings: [settings({ unlock_rule: 'immediate' })], programs: [{ id: 'p1', user_id: 'owner', status: 'active' }],
      program_sessions: [s({ id: 'a', seq: 1, status: 'complete', completed_at: '2026-11-17T00:45:00Z' }), s({ id: 'b', seq: 2, status: 'up_next' })],
    };
    expect((await runCron()).sent).toBe(0);
  });

  it('holds: sessions query is scoped by program_id and selects every SessionNode field', async () => {
    tables = {
      ft_push_subscriptions: [sub()], user_settings: [settings()], programs: [{ id: 'p1', user_id: 'owner', status: 'active' }],
      program_sessions: [s({ id: 'a', seq: 1, status: 'up_next' })],
    };
    await runCron();
    const sel = queries.find((x) => x.table === 'program_sessions')?.select ?? '';
    for (const c of ['id', 'seq', 'status', 'unlocked_at', 'started_at', 'completed_at', 'user_id', 'template_key']) expect(sel.split(/,\s*/)).toContain(c);
  });
});
