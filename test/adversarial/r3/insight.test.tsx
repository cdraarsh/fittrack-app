/**
 * Adversarial r3: daily insight after 1e9de40 (refetch on `fittrack:synced`).
 * A FAILING test = a defect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { MockLanguageModelV3 } from 'ai/test';
import DailyInsight, { SYNCED_EVENT } from '@/components/app/DailyInsight';
import { getDailyInsight, type InsightStore } from '@/lib/ai/insight';
import { buildStatsPack } from '@/lib/ai/stats';
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
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('insight: request storms', () => {
  it('a sync that lands while the first (slow, model) request is in flight does not fire a second /api/insight', async () => {
    // App open: <DailyInsight> fetches on mount; the sync engine's first pull
    // finishes ~1 s later and dispatches fittrack:synced while the model is
    // still generating (reasoning models, maxOutputTokens 2000).
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fetchMock = vi.fn(async () => {
      await gate;
      return json({ date: TODAY, text: 'Bench 40 kg 3×8 is up next.', model: 'groq:m', source: 'model', cached: false });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DailyInsight today={TODAY} />);
    await act(async () => {
      window.dispatchEvent(new Event(SYNCED_EVENT)); // first pull
      window.dispatchEvent(new Event(SYNCED_EVENT)); // visibilitychange sync
    });
    release();
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('server: two concurrent first-of-the-day requests call the model only once', async () => {
    const store = memoryStore();
    let calls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 20));
        return textResult(`insight #${calls}`);
      },
    });
    const providers = [{ id: 'groq' as const, label: 'groq:m', model }];
    const pack = buildStatsPack(richInput());
    const deps = { userId: 'owner', today: TODAY, store, providers, loadStats: async () => pack };
    const [a, b] = await Promise.all([getDailyInsight(deps), getDailyInsight(deps)]);
    expect(calls).toBe(1);
    expect(a.text).toBe(b.text); // the user also sees the text change between the two answers
  });

  it('a rules answer the server already cached for the day (model failed → rules:error row) is not refetched on every set tick', async () => {
    // During a workout every tick → outbox → sync ~1.5 s later → pull → synced.
    const fetchMock = vi.fn(async () => json({ date: TODAY, text: 'Up next: session 3/64.', model: 'rules:error', source: 'rules', cached: true }));
    vi.stubGlobal('fetch', fetchMock);
    const { findByText } = render(<DailyInsight today={TODAY} />);
    await findByText(/session 3\/64/);
    for (let i = 0; i < 20; i++) {
      await act(async () => {
        window.dispatchEvent(new Event(SYNCED_EVENT));
      });
    }
    // 20 sets logged → 21 GETs, each a Supabase settings + daily_insights read, for an answer that cannot change today.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe('insight: offline', () => {
  it('with no AI key configured (rules only), an offline open still shows the last insight it fetched today', async () => {
    const fetchMock = vi.fn(async () => json({ date: TODAY, text: 'Up next: session 1/64.', model: 'rules', source: 'rules', cached: false }));
    vi.stubGlobal('fetch', fetchMock);
    const first = render(<DailyInsight today={TODAY} />);
    await first.findByText(/session 1\/64/);
    first.unmount();
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const second = render(<DailyInsight today={TODAY} />);
    await act(async () => {});
    onLine.mockRestore();
    // Before 1e9de40 the rules text was kept for the day and shown offline; now the card is simply gone.
    expect(second.queryByText(/session 1\/64/)).not.toBeNull();
  });
});
