/**
 * Adversarial whole-app pass: daily insight caching (server + client) and the
 * coach daily cap. A FAILING test = a defect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MockLanguageModelV3 } from 'ai/test';
import DailyInsight from '@/components/app/DailyInsight';
import { getDailyInsight, type InsightStore } from '@/lib/ai/insight';
import { buildStatsPack, emptyStatsInput } from '@/lib/ai/stats';
import { resolveDailyCap, MAX_COACH_DAILY_CAP } from '@/lib/ai/coach';
import type { DailyInsightRow } from '@/lib/ai/types';
import { TODAY, richInput, textResult } from '../../ai/fixtures';

function memoryStore(): InsightStore {
  const rows = new Map<string, DailyInsightRow>();
  return {
    get: async (u, d) => rows.get(`${u}|${d}`) ?? null,
    save: async (r) => {
      if (!rows.has(`${r.user_id}|${r.date}`)) rows.set(`${r.user_id}|${r.date}`, r);
    },
  };
}

describe('daily insight: server cache', () => {
  it('an insight generated before the program reached the server is not served for the rest of the day', async () => {
    // Today page mounts <DailyInsight> the moment Start program writes Dexie;
    // the program rows are still in the outbox (flush ~1.5 s later).
    const store = memoryStore();
    let calls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async (opts) => {
        calls++;
        const noProgram = JSON.stringify(opts.prompt).includes('\\"program\\":null');
        return textResult(noProgram ? 'No program yet — start one to get going.' : 'Day 1 · Upper · Push is up next: bench 40 kg 3×8.');
      },
    });
    const providers = [{ id: 'groq' as const, label: 'groq:m', model }];
    const empty = buildStatsPack(emptyStatsInput(TODAY));
    const withProgram = buildStatsPack(richInput());
    await getDailyInsight({ userId: 'owner', today: TODAY, store, providers, loadStats: async () => empty });
    const later = await getDailyInsight({ userId: 'owner', today: TODAY, store, providers, loadStats: async () => withProgram });
    expect(later.text).not.toMatch(/No program/);
    expect(calls).toBe(1); // the pre-program request spent no model call
  });
});

describe('daily insight: client cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not pin a degraded (DB unreachable) fallback in localStorage for the whole day', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ date: TODAY, text: 'Log your first session and the daily insight will start here.', model: 'rules', source: 'rules', cached: false, degraded: true }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { findByText } = render(<DailyInsight today={TODAY} />);
    await findByText(/first session/);
    await act(async () => {});
    const cached = JSON.parse(localStorage.getItem('fittrack:insight') ?? 'null');
    vi.unstubAllGlobals();
    expect(cached).toBeNull();
  });

  it('a no-key rules answer (not cached server-side) is not frozen client-side either', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ date: TODAY, text: 'Up next: session 1/64.', model: 'rules', source: 'rules', cached: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const first = render(<DailyInsight today={TODAY} />);
    await first.findByText(/session 1\/64/);
    first.unmount();
    render(<DailyInsight today={TODAY} />);
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1));
    vi.unstubAllGlobals();
    // Server comment: "adding a key takes effect same day" — the client never asks again.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('coach daily cap', () => {
  it('Settings says "Empty = no cap", but an empty cap still limits to the 20 default', () => {
    expect(resolveDailyCap({ coach_daily_cap: null } as never)).toBe(MAX_COACH_DAILY_CAP);
  });
});
