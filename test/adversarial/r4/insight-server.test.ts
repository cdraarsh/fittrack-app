// @vitest-environment node
/** Adversarial r4: lib/ai/insight in-process single-flight. A FAILING test = a defect. */
import { describe, it, expect } from 'vitest';
import { getDailyInsight, type InsightStore } from '@/lib/ai/insight';
import { buildStatsPack, emptyStatsInput } from '@/lib/ai/stats';
const pack = (d: string) => buildStatsPack(emptyStatsInput(d));

const store = (): InsightStore => {
  const rows = new Map<string, never>();
  return { get: async (u, d) => rows.get(`${u}|${d}`) ?? null, save: async (r) => void rows.set(`${r.user_id}|${r.date}`, r as never) };
};

describe('getDailyInsight single-flight', () => {
  it('holds: a rejection is shared by concurrent callers but does not poison the next call', async () => {
    let n = 0;
    const deps = (s: InsightStore) => ({
      userId: 'u', today: '2026-11-14', store: s, providers: [],
      loadStats: async () => {
        n++;
        await new Promise((r) => setTimeout(r, 5));
        if (n === 1) throw new Error('db down');
        return pack('2026-11-14');
      },
    });
    const s = store();
    const [a, b] = await Promise.allSettled([getDailyInsight(deps(s)), getDailyInsight(deps(s))]);
    expect(a.status).toBe('rejected');
    expect(b.status).toBe('rejected');
    expect(n).toBe(1);
    // next call runs fresh
    await expect(getDailyInsight(deps(s))).resolves.toMatchObject({ source: 'rules', cached: false });
    expect(n).toBe(2);
  });

  it('holds: different days / users do not share; the map empties after settling', async () => {
    let n = 0;
    const mk = (userId: string, today: string) => ({ userId, today, store: store(), providers: [], loadStats: async () => (n++, pack(today)) });
    await Promise.all([getDailyInsight(mk('u', 'd1')), getDailyInsight(mk('u', 'd2')), getDailyInsight(mk('v', 'd1'))]);
    expect(n).toBe(3);
    await getDailyInsight(mk('u', 'd1'));
    expect(n).toBe(4);
  });
});
