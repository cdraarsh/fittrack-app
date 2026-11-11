// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { getDailyInsight, RULES_AFTER_ERROR_MODEL, type InsightStore } from '@/lib/ai/insight';
import { clampLines } from '@/lib/ai/prompts';
import type { ProviderEntry } from '@/lib/ai/providers';
import { ruleBasedInsight } from '@/lib/ai/rules';
import { buildStatsPack, emptyStatsInput } from '@/lib/ai/stats';
import type { DailyInsightRow } from '@/lib/ai/types';
import { TODAY, rateLimitError, richInput, textResult } from './fixtures';

function memoryStore() {
  const rows = new Map<string, DailyInsightRow>();
  const store: InsightStore & { rows: typeof rows } = {
    rows,
    get: vi.fn(async (u: string, d: string) => rows.get(`${u}|${d}`) ?? null),
    save: vi.fn(async (r: DailyInsightRow) => {
      const k = `${r.user_id}|${r.date}`;
      if (!rows.has(k)) rows.set(k, r);
    }),
  };
  return store;
}

const chain = (...models: MockLanguageModelV3[]): ProviderEntry[] =>
  models.map((model, i) => ({ id: i ? 'openrouter' : 'groq', label: i ? 'openrouter:m' : 'groq:openai/gpt-oss-120b', model }));

describe('ruleBasedInsight', () => {
  it('writes ≤3 lines of readiness, session + loads, trend from the stats pack', () => {
    const text = ruleBasedInsight(buildStatsPack(richInput()));
    const lines = text.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^Recovery is low/);
    expect(lines[0]).toContain('sleep 5 h');
    expect(lines[0]).toContain('HRV 48 (28d avg 60)');
    expect(lines[1]).toBe('Up next: session 13/16 · Upper A — Bench Press 95 kg 3×5-8.');
    expect(lines[2]).toMatch(/e1RM up 1\d\.\d% over 4 weeks/);
  });

  it('handles a brand-new user', () => {
    expect(ruleBasedInsight(buildStatsPack(emptyStatsInput(TODAY)))).toMatch(/first session/);
  });

  it('falls back to adherence or bodyweight when no e1RM trend', () => {
    const input = richInput();
    input.exercises = [];
    input.dailies = [];
    const text = ruleBasedInsight(buildStatsPack(input));
    expect(text).toContain('Adherence: 12/15');
    expect(text.split('\n').length).toBeLessThanOrEqual(3);
  });

  it('nudges after a long gap', () => {
    const input = richInput();
    input.today = '2026-11-20';
    input.dailies = [];
    input.exercises = [];
    input.program = { ...input.program!, sessions_per_week: null };
    input.bodyWeights = [];
    expect(ruleBasedInsight(buildStatsPack(input))).toMatch(/14 days since your last session/);
  });
});

describe('clampLines', () => {
  it('strips markdown/bullets and keeps 3 lines', () => {
    expect(clampLines('- **One**\n\n2. Two\n* Three\nFour')).toBe('One\nTwo\nThree');
    expect(clampLines('x'.repeat(200)).length).toBe(160);
  });
});

describe('getDailyInsight', () => {
  const loadStats = vi.fn(async () => buildStatsPack(richInput()));

  it('no key → rule-based, no cache write, zero model calls', async () => {
    const store = memoryStore();
    const res = await getDailyInsight({ userId: 'u1', today: TODAY, store, loadStats, providers: [] });
    expect(res).toMatchObject({ source: 'rules', model: 'rules', cached: false });
    expect(res.text).toBe(ruleBasedInsight(buildStatsPack(richInput())));
    expect(store.save).not.toHaveBeenCalled();
  });

  it('calls the model once per day and serves the cache afterwards', async () => {
    const store = memoryStore();
    const groq = new MockLanguageModelV3({ doGenerate: textResult('**Line one**\nLine two\nLine three\nLine four') });
    const deps = { userId: 'u1', today: TODAY, store, loadStats, providers: chain(groq) };

    const first = await getDailyInsight(deps);
    expect(first).toMatchObject({ source: 'model', model: 'groq:openai/gpt-oss-120b', cached: false });
    expect(first.text).toBe('Line one\nLine two\nLine three');
    expect(store.rows.get(`u1|${TODAY}`)).toMatchObject({ model: 'groq:openai/gpt-oss-120b', text: first.text });
    expect((store.rows.get(`u1|${TODAY}`)!.stats_pack as { date: string }).date).toBe(TODAY);

    const second = await getDailyInsight(deps);
    expect(second).toMatchObject({ cached: true, text: first.text, source: 'model' });
    expect(groq.doGenerateCalls).toHaveLength(1);
  });

  it('prompt carries the stats pack and the system prompt', async () => {
    const groq = new MockLanguageModelV3({ doGenerate: textResult('ok') });
    await getDailyInsight({ userId: 'u2', today: TODAY, store: memoryStore(), loadStats, providers: chain(groq) });
    const call = JSON.stringify(groq.doGenerateCalls[0].prompt);
    expect(call).toContain('at most 3 short lines');
    expect(call).toContain('Bench Press');
  });

  it('falls back to OpenRouter on Groq 429', async () => {
    const groq = new MockLanguageModelV3({ doGenerate: async () => { throw rateLimitError(); } });
    const or = new MockLanguageModelV3({ doGenerate: textResult('from openrouter') });
    const res = await getDailyInsight({ userId: 'u1', today: TODAY, store: memoryStore(), loadStats, providers: chain(groq, or) });
    expect(res).toMatchObject({ source: 'model', model: 'openrouter:m', text: 'from openrouter' });
  });

  it('all providers failing → rule text cached as rules:error, not retried today', async () => {
    const store = memoryStore();
    const groq = new MockLanguageModelV3({ doGenerate: async () => { throw rateLimitError(); } });
    const deps = { userId: 'u1', today: TODAY, store, loadStats, providers: chain(groq), log: () => {} };
    const res = await getDailyInsight(deps);
    expect(res).toMatchObject({ source: 'rules', model: RULES_AFTER_ERROR_MODEL });
    expect(res.text).toBe(ruleBasedInsight(buildStatsPack(richInput())));
    const again = await getDailyInsight(deps);
    expect(again).toMatchObject({ cached: true, source: 'rules' });
    expect(groq.doGenerateCalls).toHaveLength(1);
  });

  it('empty model output → rules', async () => {
    const groq = new MockLanguageModelV3({ doGenerate: textResult('   \n ') });
    const res = await getDailyInsight({ userId: 'u1', today: TODAY, store: memoryStore(), loadStats, providers: chain(groq) });
    expect(res.source).toBe('rules');
  });

  it('cache read failure still produces an insight', async () => {
    const store = memoryStore();
    store.get = vi.fn(async () => { throw new Error('db down'); });
    const res = await getDailyInsight({ userId: 'u1', today: TODAY, store, loadStats, providers: [], log: () => {} });
    expect(res.source).toBe('rules');
  });
});
