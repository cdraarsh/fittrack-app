// @vitest-environment node
/** Adversarial r4: Strength page e1RM (lib/strength/lifts) vs the coach's epley1RM. A FAILING test = a defect. */
import { describe, it, expect } from 'vitest';
import { liftProgress } from '@/lib/strength/lifts';
import { epley1RM } from '@/lib/ai/stats';

const input = (kg: number, reps: number) => ({
  exercises: [{ id: 'bench', name: 'Bench Press' }],
  sessions: [{ id: 's1', seq: 1, completed_at: '2026-11-10T10:00:00Z', started_at: null }],
  sessionExercises: [{ id: 'se1', session_id: 's1', exercise_id: 'bench' }],
  logs: [{ session_exercise_id: 'se1', set_index: 0, done: true, weight_kg: kg, reps, logged_at: null, updated_at: '2026-11-10T10:00:00Z' }],
});

describe('e1RM consistency', () => {
  it('a single (100 kg × 1) is a 100 kg 1RM on the Strength page, as the coach says', () => {
    // Before 3dfc613 lifts.ts called epley1RM (reps=1 → the weight). The inlined formula gives 103.3.
    const p = liftProgress(input(100, 1) as never, '2026-11-14');
    expect(epley1RM(100, 1)).toBe(100);
    expect(p[0].best.e1rm).toBe(100);
  });

  it('holds: 2–12 reps agree exactly with the coach', () => {
    for (const reps of [2, 5, 8, 12]) {
      const p = liftProgress(input(80, reps) as never, '2026-11-14');
      expect(p[0].best.e1rm).toBe(Math.round(epley1RM(80, reps)! * 10) / 10);
    }
  });

  it('documents: 13–20 reps show on the Strength page; the coach has no e1RM for them (null)', () => {
    const p = liftProgress(input(20, 15) as never, '2026-11-14');
    expect(p[0].best.e1rm).toBe(30);
    expect(epley1RM(20, 15)).toBeNull();
  });
});
