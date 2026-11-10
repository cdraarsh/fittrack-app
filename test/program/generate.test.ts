import { describe, it, expect } from 'vitest';
import { generateProgram, FOUR_DAY_SPLIT, missingWorkingSets, allWorkingSetsDone, hitTopOfRange, setLogId, deterministicUuid, advance } from '@/lib/program';
import { EXERCISES_BY_ID } from '@/lib/exercises';

const input = { template: FOUR_DAY_SPLIT, programId: '11111111-1111-4111-8111-111111111111', userId: 'user_1', startDate: '2026-11-10', now: '2026-11-10T08:00:00.000Z' };

describe('generateProgram', () => {
  const g = generateProgram(input);

  it('produces 64 numbered sessions, 4 per week for 16 weeks', () => {
    expect(g.sessions).toHaveLength(64);
    expect(g.sessions.map((s) => s.seq)).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
    expect(g.sessions[0].week).toBe(1);
    expect(g.sessions[3].week).toBe(1);
    expect(g.sessions[4].week).toBe(2);
    expect(g.sessions[63].week).toBe(16);
    expect(g.program).toMatchObject({ sessions_per_week: 4, weeks: 16, status: 'active' });
  });

  it('rotates Upper A / Lower A / Upper B / Lower B', () => {
    expect(g.sessions.slice(0, 8).map((s) => s.template_key)).toEqual(['upper_a', 'lower_a', 'upper_b', 'lower_b', 'upper_a', 'lower_a', 'upper_b', 'lower_b']);
  });

  it('only session 1 starts up_next', () => {
    expect(g.sessions[0].status).toBe('up_next');
    expect(g.sessions.slice(1).every((s) => s.status === 'locked')).toBe(true);
  });

  it('is deterministic (same ids every time) and ids are unique', () => {
    expect(generateProgram(input)).toEqual(g);
    const ids = [...g.sessions.map((s) => s.id), ...g.sessionExercises.map((s) => s.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
  });

  it('different program ids give different session ids', () => {
    const other = generateProgram({ ...input, programId: '22222222-2222-4222-8222-222222222222' });
    expect(other.sessions[0].id).not.toBe(g.sessions[0].id);
  });

  it('every prescribed exercise exists in the library', () => {
    for (const se of g.sessionExercises) expect(EXERCISES_BY_ID[se.exercise_id]).toBeDefined();
    expect(g.sessionExercises.filter((se) => se.session_id === g.sessions[0].id)).toHaveLength(6);
    expect(g.sessionExercises.filter((se) => se.session_id === g.sessions[3].id)).toHaveLength(5);
  });

  it('deload week stays in sequence with lighter targets and same sets × reps', () => {
    const deload = g.sessions.filter((s) => s.is_deload);
    expect(deload.map((s) => s.seq)).toEqual([57, 58, 59, 60]);
    expect(deload.every((s) => s.week === 15 && s.title.endsWith('(Deload)'))).toBe(true);
    // deload sits between weeks 14 and 16: ordering untouched
    expect(g.sessions[55].week).toBe(14);
    expect(g.sessions[60].week).toBe(16);
    const benchNormal = g.sessionExercises.find((se) => se.session_id === g.sessions[52].id && se.exercise_id === 'bench')!;
    const benchDeload = g.sessionExercises.find((se) => se.session_id === g.sessions[56].id && se.exercise_id === 'bench')!;
    expect(benchNormal.target_kg).toBe(40);
    expect(benchDeload.target_kg).toBe(25); // 40 × 0.6 = 24 → 25 (2.5 kg plates)
    expect([benchDeload.sets, benchDeload.rep_lo, benchDeload.rep_hi]).toEqual([benchNormal.sets, benchNormal.rep_lo, benchNormal.rep_hi]);
  });

  it('phases follow the week', () => {
    expect(g.sessions[0].phase).toBe('Foundation');
    expect(g.sessions[20].phase).toBe('Build');
    expect(g.sessions[40].phase).toBe('Strength');
    expect(g.sessions[63].phase).toBe('Peak');
  });

  it('deload sessions cannot be reached early', () => {
    const deloadId = g.sessions[56].id;
    const r = advance(g.sessions, { type: 'log_set', sessionId: deloadId }, { now: input.now, rule: 'immediate', timeZone: 'UTC' });
    expect(r.error).toBe('locked');
  });
});

describe('completion predicate', () => {
  const ses = [{ id: 'a', sets: 2, rep_hi: 10 }, { id: 'b', sets: 1, rep_hi: 45 }];
  const log = (se: string, i: number, o: Partial<{ done: boolean; reps: number | null; seconds: number | null }> = {}) =>
    ({ session_exercise_id: se, set_index: i, done: true, reps: 10, seconds: null, ...o });

  it('counts every prescribed set', () => {
    expect(missingWorkingSets(ses, [])).toBe(3);
    expect(missingWorkingSets(ses, [log('a', 0), log('a', 1), log('b', 0, { reps: null, seconds: 40 })])).toBe(0);
  });
  it('a ticked set without reps/seconds does not count; undone does not count', () => {
    expect(missingWorkingSets(ses, [log('a', 0, { reps: null }), log('a', 1, { done: false }), log('b', 0)])).toBe(2);
  });
  it('extra sets beyond the prescription are ignored', () => {
    expect(allWorkingSetsDone(ses, [log('a', 0), log('a', 1), log('a', 2), log('b', 0)])).toBe(true);
  });
  it('+2.5 kg hint only when all sets hit the top of the range', () => {
    expect(hitTopOfRange(ses[0], [log('a', 0), log('a', 1)], false)).toBe(true);
    expect(hitTopOfRange(ses[0], [log('a', 0), log('a', 1, { reps: 9 })], false)).toBe(false);
    expect(hitTopOfRange(ses[1], [log('b', 0, { reps: null, seconds: 45 })], true)).toBe(true);
  });
});

describe('ids', () => {
  it('setLogId is stable per (session exercise, index)', () => {
    expect(setLogId('x', 0)).toBe(setLogId('x', 0));
    expect(setLogId('x', 0)).not.toBe(setLogId('x', 1));
    expect(deterministicUuid('a')).not.toBe(deterministicUuid('b'));
  });
});
