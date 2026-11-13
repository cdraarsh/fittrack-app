import { describe, it, expect } from 'vitest';
import { liftProgress, type LiftRowsInput } from '@/lib/strength/lifts';

const base = (): LiftRowsInput => ({
  exercises: [
    { id: 'bench', name: 'Flat Barbell Bench Press' },
    { id: 'plank', name: 'Plank', is_timed: true },
  ],
  sessions: [
    { id: 's1', seq: 1, template_key: 'upper_a', completed_at: '2026-11-01T10:00:00Z', started_at: null },
    { id: 's5', seq: 5, template_key: 'upper_a', completed_at: '2026-11-08T10:00:00Z', started_at: null },
  ],
  sessionExercises: [
    { id: 'se1', session_id: 's1', exercise_id: 'bench' },
    { id: 'se5', session_id: 's5', exercise_id: 'bench' },
    { id: 'sp', session_id: 's5', exercise_id: 'plank' },
  ],
  logs: [],
});
const log = (se: string, kg: number | null, reps: number | null, done = true) => ({
  session_exercise_id: se, weight_kg: kg, reps, seconds: null, done, logged_at: null, updated_at: '2026-11-01T00:00:00Z',
});

describe('liftProgress', () => {
  it('takes each session\'s best set, tracks best, latest and 28-day change', () => {
    const input = base();
    input.logs = [log('se1', 40, 10), log('se1', 42.5, 6), log('se5', 42.5, 10), log('se5', 50, 2, false)];
    const [bench] = liftProgress(input, '2026-11-14');
    expect(bench.sessions).toBe(2);
    expect(bench.trend.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-08']);
    expect(bench.trend[0]).toMatchObject({ topKg: 40, topReps: 10, e1rm: 53.3 }); // 40×10 beats 42.5×6 (51.0)
    expect(bench.latest).toMatchObject({ topKg: 42.5, topReps: 10, e1rm: 56.7 });
    expect(bench.best.e1rm).toBe(56.7);
    expect(bench.change28).toBe(3.4);
  });

  it('ignores undone, unweighted and timed sets; empty when nothing logged', () => {
    const input = base();
    input.logs = [log('se1', null, 10), log('se1', 40, null), log('se1', 40, 8, false), log('sp', 0, 60)];
    expect(liftProgress(input, '2026-11-14')).toEqual([]);
  });
});
