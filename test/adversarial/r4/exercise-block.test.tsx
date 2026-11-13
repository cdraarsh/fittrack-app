/**
 * Adversarial r4: set grid parsing after 3dfc613 (parseSetValue regexes) as the
 * user actually reaches it — through <input type="number">.
 * A FAILING test = a defect.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { parseSetValue } from '@/lib/program/inputs';

vi.mock('@/components/workout/SwapSheet', () => ({ default: () => null }));
vi.mock('@/components/workout/VideoSheet', () => ({ VideoButton: () => null }));
const toastMock = vi.fn();
vi.mock('@/components/shared/Toast', async (orig) => ({ ...(await orig<object>()), toast: (...a: unknown[]) => toastMock(...a) }));

import ExerciseBlock from '@/components/workout/ExerciseBlock';

const ex = (o: Record<string, unknown> = {}) => ({
  id: 'bench', name: 'Bench Press', pattern: 'push', equipment: 'barbell', is_timed: false, rep_lo: 6, rep_hi: 10,
  swap_group: 'g', garmin_category: null, garmin_subtype: null, cue: null, ...o,
});
const se = { id: 'se1', session_id: 's1', user_id: 'owner', exercise_id: 'bench', prescribed_exercise_id: 'bench', position: 0, sets: 2, rep_lo: 6, rep_hi: 10, rest_s: 90, target_kg: null, created_at: '', updated_at: '' };
const log = { id: 'l0', session_exercise_id: 'se1', session_id: 's1', user_id: 'owner', set_index: 0, weight_kg: 40, reps: 8, seconds: null, rpe: null, done: true, source: 'manual', garmin_activity_id: null, logged_at: null, created_at: '', updated_at: '' };

describe('parseSetValue edge strings', () => {
  it('holds: accepted/rejected as intended', () => {
    const w = (s: string) => parseSetValue(s, 'weight_kg');
    const r = (s: string) => parseSetValue(s, 'reps');
    expect([w('.5'), w('+.5'), w(',5'), w('0'), w('42,5')]).toEqual([0.5, 0.5, 0.5, 0, 42.5]);
    expect([r('00012'), r('0'), r(' 8 ')]).toEqual([12, 0, 8]);
    expect([w('42,5,1'), r('4 2'), r('٤٢'), r('１２'), w('1e3'), w('-1'), w('Infinity')]).toEqual([null, null, null, null, null, null, null]);
  });

  it('"42." (decimal point typed, next digit not yet) is read as 42, as parseFloat did before 3dfc613', () => {
    // Regression in the pure function: now null, and blurSave treats null as "clear the field".
    expect(parseSetValue('42.', 'weight_kg')).toBe(42);
  });
});

describe('ExerciseBlock: a value the parser rejects', () => {
  it('a rejected weight on a done set is not silently saved as "no weight"', async () => {
    const onSave = vi.fn(async () => ({}));
    render(
      <ExerciseBlock item={{ se, exercise: ex() as never, prescribed: ex() as never, logs: [log as never] }} mode="active" isDeload={false} lastWeight={null} onSave={onSave} onTicked={() => {}} />,
    );
    const weight = screen.getByLabelText('Bench Press set 1 weight') as HTMLInputElement;
    expect(weight.value).toBe('40');
    // The field is type="number": per the HTML spec a value that isn't a valid float
    // ("42,5" on a comma-locale keypad, "42.", "1e") is sanitized to "" — so the new
    // comma handling in parseSetValue never even sees the comma here.
    fireEvent.change(weight, { target: { value: '42,5' } });
    // The grid is now type=text with a decimal keypad, so "42,5" reaches the parser (= 42.5).
    await act(async () => {
      fireEvent.blur(weight);
    });
    // Saved {weight_kg: null} on a ticked 40 kg set with no toast.
    expect(onSave).not.toHaveBeenCalledWith(0, { weight_kg: null });
  });

  it('holds: a reps↔seconds swap shows the swapped-in range; a missing exercise row falls back to the prescription', () => {
    const lsit = ex({ id: 'lsit', name: 'L-Sit Hold', is_timed: true, rep_lo: 15, rep_hi: 30 });
    const kr = ex({ id: 'kr', name: 'Knee Raise', rep_lo: 12, rep_hi: 15 });
    const se2 = { ...se, exercise_id: 'lsit', prescribed_exercise_id: 'kr', rep_lo: 12, rep_hi: 15 };
    const a = render(<ExerciseBlock item={{ se: se2, exercise: lsit as never, prescribed: kr as never, logs: [] }} mode="active" isDeload={false} lastWeight={null} onSave={vi.fn()} onTicked={() => {}} />);
    expect(a.container.textContent).toContain('2 × 15–30s');
    a.unmount();
    const b = render(<ExerciseBlock item={{ se: se2, exercise: undefined, prescribed: kr as never, logs: [] }} mode="active" isDeload={false} lastWeight={null} onSave={vi.fn()} onTicked={() => {}} />);
    expect(b.container.textContent).toContain('2 × 12–15 reps');
  });

  it('documents: a reps→reps swap keeps the prescribed range (Back Squat 5–8 → Leg Press 10–15 shows 5–8)', () => {
    const squat = ex({ id: 'squat', name: 'Back Squat', rep_lo: 5, rep_hi: 8 });
    const press = ex({ id: 'press', name: 'Leg Press', rep_lo: 10, rep_hi: 15 });
    const se3 = { ...se, exercise_id: 'press', prescribed_exercise_id: 'squat', rep_lo: 5, rep_hi: 8 };
    const r = render(<ExerciseBlock item={{ se: se3, exercise: press as never, prescribed: squat as never, logs: [] }} mode="active" isDeload={false} lastWeight={null} onSave={vi.fn()} onTicked={() => {}} />);
    expect(r.container.textContent).toContain('2 × 5–8 reps');
  });
});
