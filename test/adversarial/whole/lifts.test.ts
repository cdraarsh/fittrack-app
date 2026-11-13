// @vitest-environment node
/** Adversarial whole-app pass: Strength › Lifts. A FAILING test = a defect. */
import { describe, it, expect } from 'vitest';
import { liftProgress } from '@/lib/strength/lifts';
import { hitTopOfRange } from '@/lib/program';

const exercises = [
  { id: 'bicep', name: 'Dumbbell Curl' },
  { id: 'calf', name: 'Calf Raise' },
  { id: 'bench', name: 'Bench Press' },
  { id: 'dbbench', name: 'Dumbbell Bench Press' },
  { id: 'plank', name: 'Plank', is_timed: true },
];
const sessions = [
  { id: 's1', seq: 1, template_key: 'upper_a', completed_at: '2026-11-15T06:00:00Z', started_at: '2026-11-15T05:00:00Z' },
  { id: 's2', seq: 2, template_key: 'lower_a', completed_at: '2026-11-16T06:00:00Z', started_at: '2026-11-16T05:00:00Z' },
];
const log = (se: string, kg: number | null, reps: number | null, seconds: number | null = null) => ({
  session_exercise_id: se, weight_kg: kg, reps, seconds, done: true, logged_at: '2026-11-15T05:30:00Z', updated_at: '2026-11-15T05:30:00Z',
});

describe('liftProgress', () => {
  it('prescribed high-rep work (curls 2×12–15, calf raises 3×15–20) still shows up in Lifts', () => {
    const out = liftProgress(
      {
        exercises,
        sessions,
        sessionExercises: [
          { id: 'se-curl', session_id: 's1', exercise_id: 'bicep' },
          { id: 'se-calf', session_id: 's2', exercise_id: 'calf' },
        ],
        // Hitting the top of the prescribed range = the progression signal.
        logs: [log('se-curl', 8, 15), log('se-curl', 8, 15), log('se-calf', 40, 20)],
      },
      '2026-11-16',
    );
    expect(out.map((l) => l.exerciseId).sort()).toEqual(['bicep', 'calf']);
  });

  it('holds: a swapped exercise is tracked under what was actually lifted; timed rows are skipped', () => {
    const out = liftProgress(
      {
        exercises,
        sessions,
        sessionExercises: [
          { id: 'se-b', session_id: 's1', exercise_id: 'dbbench' },
          { id: 'se-p', session_id: 's2', exercise_id: 'plank' },
        ],
        logs: [log('se-b', 20, 10), log('se-p', null, null, 45)],
      },
      '2026-11-16',
    );
    expect(out.map((l) => l.exerciseId)).toEqual(['dbbench']);
  });
});

describe('top-of-range hint', () => {
  it('a timed / bodyweight exercise is not told to "add 2.5 kg next session"', () => {
    // ExerciseBlock shows "All sets hit top of range — add 2.5 kg next session!" when this is true.
    const plank = { id: 'se-p', sets: 3, rep_hi: 45 };
    const logs = [0, 1, 2].map((i) => ({ session_exercise_id: 'se-p', set_index: i, done: true, reps: null, seconds: 45 }));
    expect(hitTopOfRange(plank, logs, true)).toBe(false);
  });
});
