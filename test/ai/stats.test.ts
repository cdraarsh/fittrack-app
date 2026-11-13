// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  adherence,
  buildBodyweight,
  buildRecovery,
  buildStatsPack,
  detectMainLifts,
  emptyStatsInput,
  epley1RM,
  localDate,
  phaseFor,
  statsPackToPrompt,
} from '@/lib/ai/stats';
import { TODAY, richInput } from './fixtures';

describe('epley1RM', () => {
  it('computes Epley e1RM', () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(100, 5)).toBeCloseTo(116.667, 2);
    expect(epley1RM(60, 10)).toBeCloseTo(80, 5);
  });
  it('rejects unusable sets', () => {
    expect(epley1RM(null, 5)).toBeNull();
    expect(epley1RM(100, null)).toBeNull();
    expect(epley1RM(0, 5)).toBeNull();
    expect(epley1RM(100, 0)).toBeNull();
    expect(epley1RM(50, 15)).toBeNull();
  });
});

describe('helpers', () => {
  it('phaseFor splits the program into quarters', () => {
    expect(phaseFor(1, 16)).toBe('foundation');
    expect(phaseFor(5, 16)).toBe('build');
    expect(phaseFor(9, 16)).toBe('strength');
    expect(phaseFor(16, 16)).toBe('peak');
    expect(phaseFor(null, 16)).toBeNull();
  });
  it('localDate respects timezone', () => {
    const instant = '2026-11-10T03:00:00Z';
    expect(localDate(instant, 'UTC')).toBe('2026-11-10');
    expect(localDate(instant, 'America/Los_Angeles')).toBe('2026-11-09');
    expect(localDate(instant, 'Not/AZone')).toBe('2026-11-10');
  });
  it('detects main lifts by name, preferring plain names', () => {
    const lifts = detectMainLifts([
      { id: 'a', name: 'Bulgarian Split Squat', pattern: 'quads' },
      { id: 'b', name: 'Back Squat', pattern: 'quads' },
      { id: 'c', name: 'Plank', pattern: 'core', is_timed: true },
      { id: 'd', name: 'Romanian Deadlift', pattern: 'hinge' },
    ]);
    expect(lifts.map(l => l.id)).toEqual(['b', 'd']);
    expect(detectMainLifts([{ id: 'x', name: 'Row', pattern: null }], ['x']).map(l => l.id)).toEqual(['x']);
  });
});

describe('buildStatsPack (rich data)', () => {
  const pack = buildStatsPack(richInput());

  it('program position', () => {
    expect(pack.program).toMatchObject({
      name: 'Upper/Lower',
      completed: 12,
      total: 16,
      week: 4,
      totalWeeks: 4,
      phase: 'peak',
      daysSinceLast: 4,
    });
    expect(pack.program!.nextSession).toMatchObject({ seq: 13, title: 'Upper A' });
    expect(pack.program!.nextSession!.exercises[0]).toEqual({ name: 'Bench Press', sets: 3, reps: '5-8', targetKg: 92.5 });
  });

  it('last session top set and misses', () => {
    expect(pack.lastSession).toMatchObject({ seq: 12, date: '2026-11-06' });
    expect(pack.lastSession!.exercises[0]).toEqual({
      name: 'Back Squat',
      top: { kg: 112.5, reps: 5, seconds: null },
      setsDone: 3,
      setsPrescribed: 3,
      misses: 1,
    });
  });

  it('e1RM trend over 4 weekly buckets', () => {
    const bench = pack.trends.e1rm.find(t => t.name === 'Bench Press')!;
    expect(bench.weekly).toHaveLength(4);
    expect(bench.weekly[0]).toBeCloseTo((82.5 * 7) / 6, 0); // best of week 1
    expect(bench.weekly[3]).toBeCloseTo((92.5 * 7) / 6, 0);
    expect(bench.changePct).toBeCloseTo(12.1, 1);
    expect(pack.trends.e1rm.map(t => t.name).sort()).toEqual(['Back Squat', 'Bench Press']);
  });

  it('weekly sets per muscle group (last 7 days)', () => {
    expect(pack.trends.weeklySets).toEqual({ chest: 3, quads: 3 });
  });

  it('adherence prorated to program start', () => {
    // program started 26 days ago → 27 days × 4/7 ≈ 15 expected
    expect(pack.trends.adherence).toEqual({ completed: 12, expected: 15, pct: 80 });
  });

  it('recovery vs 7/28-day baselines', () => {
    const r = pack.recovery!;
    expect(r.date).toBe(TODAY);
    expect(r.stale).toBe(false);
    expect(r.metrics.hrv).toEqual({ value: 48, avg7: 60, avg28: 60 });
    expect(r.metrics.sleepH.value).toBe(5);
    expect(r.readiness).toBe('low');
    expect(r.flags).toEqual(
      expect.arrayContaining(['hrv_below_baseline', 'resting_hr_elevated', 'short_sleep', 'low_body_battery']),
    );
  });

  it('bodyweight 7-day avg and change', () => {
    expect(pack.bodyweight).toEqual({ latest: 81.5, latestDate: TODAY, avg7: 81.5, prevAvg7: 82, change: -0.5 });
  });

  it('serialises to roughly 1–2K tokens', () => {
    const json = statsPackToPrompt(pack);
    expect(json.length).toBeLessThan(8000); // ~4 chars/token
    expect(json).not.toContain('null,"'); // nulls dropped from objects
  });
});

describe('missing data', () => {
  it('empty input gives an all-null pack without throwing', () => {
    const pack = buildStatsPack(emptyStatsInput(TODAY));
    expect(pack).toEqual({
      date: TODAY,
      program: null,
      lastSession: null,
      trends: { e1rm: [], weeklySets: {}, adherence: null },
      recovery: null,
      bodyweight: null,
    });
  });

  it('program with no completed sessions', () => {
    const input = richInput();
    input.sessions = input.sessions.map(s => ({ ...s, status: 'locked', completed_at: null }));
    input.setLogs = [];
    const pack = buildStatsPack(input);
    expect(pack.program).toMatchObject({ completed: 0, daysSinceLast: null, nextSession: { seq: 1 } });
    expect(pack.lastSession).toBeNull();
    expect(pack.trends.e1rm.every(t => t.weekly.every(w => w === null) && t.changePct === null)).toBe(true);
    expect(pack.trends.adherence).toMatchObject({ completed: 0, pct: 0 });
  });

  it('adherence is null without sessions_per_week', () => {
    const input = richInput();
    input.program = { ...input.program!, sessions_per_week: null };
    expect(adherence(input)).toBeNull();
  });

  it('recovery tolerates null metrics and no baseline', () => {
    const r = buildRecovery(
      [{ date: TODAY, sleep_s: null, resting_hr: null, hrv: null, body_battery: null, stress_avg: null, steps: null }],
      TODAY,
    )!;
    expect(r.readiness).toBe('good');
    expect(r.flags).toEqual([]);
    expect(r.metrics.hrv).toEqual({ value: null, avg7: null, avg28: null });
  });

  it('recovery marks stale data and ignores future rows', () => {
    const r = buildRecovery(
      [
        { date: '2026-11-05', sleep_s: 28800, resting_hr: 50, hrv: 60, body_battery: 80, stress_avg: 20, steps: 1 },
        { date: '2026-11-12', sleep_s: 1, resting_hr: 99, hrv: 1, body_battery: 1, stress_avg: 99, steps: 1 },
      ],
      TODAY,
    )!;
    expect(r.date).toBe('2026-11-05');
    expect(r.stale).toBe(true);
  });

  it('bodyweight with only old-week data has no avg7', () => {
    const bw = buildBodyweight([{ date: '2026-11-01', kg: 80 }, { date: '2026-11-02', kg: null }], TODAY)!;
    expect(bw).toEqual({ latest: 80, latestDate: '2026-11-01', avg7: null, prevAvg7: 80, change: null });
    expect(buildBodyweight([], TODAY)).toBeNull();
  });
});

describe('next session: same name and target as the app shows', () => {
  it('labels Day N · category and falls back to the template start when never lifted', async () => {
    const { buildStatsPack, emptyStatsInput } = await import('@/lib/ai/stats');
    const input = emptyStatsInput('2026-11-14');
    input.program = { id: 'p', name: 'p', start_date: '2026-11-10', sessions_per_week: 4, weeks: 16, status: 'active' } as never;
    input.sessions = [
      { id: 's1', seq: 1, week: 1, title: 'Upper A — Push Focus', status: 'complete', completed_at: '2026-11-10T10:00:00Z', template_key: 'upper_a' },
      { id: 's2', seq: 2, week: 1, title: 'Lower A — Quad Focus', status: 'up_next', completed_at: null, template_key: 'lower_a', is_deload: false },
    ];
    input.exercises = [{ id: 'squat', name: 'Barbell Back Squat', pattern: 'squat', is_timed: false }] as never;
    input.sessionExercises = [{ id: 'se2', session_id: 's2', exercise_id: 'squat', position: 0, sets: 3, rep_lo: 6, rep_hi: 8, target_kg: 60 }] as never;
    const next = buildStatsPack(input).program!.nextSession!;
    expect(next.title).toBe('Day 2 · Lower · Quads');
    expect(next.exercises[0].targetKg).toBe(60);
  });
});
