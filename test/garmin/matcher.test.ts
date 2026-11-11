// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { matchWatchSets, normalizeKey } from '@/lib/garmin/matcher';
import { ex, log, ws } from './helpers';

const bench = ex({ id: 'bench', position: 0, garminCategory: 'BENCH_PRESS', garminSubtype: 'BARBELL_BENCH_PRESS' });
const incline = ex({ id: 'incline', position: 1, garminCategory: 'BENCH_PRESS', garminSubtype: 'INCLINE_DUMBBELL_BENCH_PRESS' });
const row = ex({ id: 'row', position: 2, garminCategory: 'ROW', garminSubtype: null });
const plank = ex({ id: 'plank', position: 3, sets: 2, isTimed: true, garminCategory: 'PLANK' });

describe('normalizeKey', () => {
  it('folds case and separators', () => {
    expect(normalizeKey('BENCH_PRESS')).toBe('benchpress');
    expect(normalizeKey('benchPress')).toBe('benchpress');
    expect(normalizeKey('')).toBeNull();
    expect(normalizeKey(null)).toBeNull();
  });
});

describe('matchWatchSets', () => {
  it('rule 1: exact category + subtype (by name or number)', () => {
    const numeric = ex({ id: 'n', position: 5, garminCategory: 'benchPress', garminSubtype: 1, sets: 1 });
    const sets = [
      ws({ index: 0, category: 'benchPress', subtype: 22, subtypeName: 'inclineDumbbellBenchPress' }),
      ws({ index: 1, category: 'benchPress', subtype: 1, subtypeName: 'barbellBenchPress' }),
    ];
    const r = matchWatchSets(sets, [bench, incline], []);
    expect(r.fills.map((f) => [f.watchSetIndex, f.sessionExerciseId, f.rule])).toEqual([
      [1, 'bench', 'exact'],
      [0, 'incline', 'exact'],
    ]);
    const r2 = matchWatchSets([ws({ index: 0, category: 'benchPress', subtype: 1 })], [numeric], []);
    expect(r2.fills[0]).toMatchObject({ sessionExerciseId: 'n', rule: 'exact' });
  });

  it('rule 2: category unique in session', () => {
    const r = matchWatchSets([ws({ index: 0, category: 'row', subtype: 7, subtypeName: 'somethingElse' })], [bench, row], []);
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0]).toMatchObject({ sessionExerciseId: 'row', rule: 'category', setIndex: 0, reps: 8, weightKg: 50 });
  });

  it('rule 3: order fallback for uncategorised and ambiguous sets', () => {
    // Category benchPress matches two exercises, subtype unknown → ambiguous → order.
    const sets = [
      ws({ index: 0, category: 'benchPress' }),
      ws({ index: 1, category: 'benchPress' }),
      ws({ index: 2, category: 'benchPress' }),
      ws({ index: 3, category: 'benchPress' }),
      ws({ index: 4 }), // uncategorised → follows previous exercise (incline, has room)
    ];
    const r = matchWatchSets(sets, [bench, incline, row], []);
    const by = Object.fromEntries(r.fills.map((f) => [f.watchSetIndex, [f.sessionExerciseId, f.setIndex, f.rule]]));
    expect(by[0]).toEqual(['bench', 0, 'order']);
    expect(by[2]).toEqual(['bench', 2, 'order']);
    expect(by[3]).toEqual(['incline', 0, 'order']);
    expect(by[4]).toEqual(['incline', 1, 'order']);
    expect(r.leftovers).toHaveLength(0);
  });

  it('uncategorised sets after a matched one stay with that exercise', () => {
    const sets = [ws({ index: 0, category: 'row' }), ws({ index: 1 }), ws({ index: 2 })];
    const r = matchWatchSets(sets, [bench, row], []);
    expect(r.fills.map((f) => f.sessionExerciseId)).toEqual(['row', 'row', 'row']);
    expect(r.fills.map((f) => f.rule)).toEqual(['category', 'order', 'order']);
  });

  it('rule 4: leftovers go to the review tray', () => {
    const sets = [
      ws({ index: 0, category: 'squat' }), // no squat in session
      ws({ index: 1, category: 'row' }),
      ws({ index: 2, category: 'row' }),
      ws({ index: 3, category: 'row' }),
      ws({ index: 4, category: 'row' }), // row has only 3 sets
    ];
    const r = matchWatchSets(sets, [row], []);
    expect(r.fills).toHaveLength(3);
    expect(r.leftovers.map((l) => [l.set.index, l.reason])).toEqual([
      [0, 'no_matching_exercise'],
      [4, 'no_empty_slot'],
    ]);
  });

  it('fills empty rows only and never overwrites done or entered data', () => {
    const logs = [
      log({ id: 'a', sessionExerciseId: 'row', setIndex: 0, done: true, reps: 10, weightKg: 70 }),
      log({ id: 'b', sessionExerciseId: 'row', setIndex: 1, weightKg: 72.5 }), // prefilled weight, not done
      log({ id: 'c', sessionExerciseId: 'row', setIndex: 2, reps: 9 }), // reps typed → not fillable
    ];
    const r = matchWatchSets([ws({ index: 0, category: 'row', reps: 8, weightKg: 60 }), ws({ index: 1, category: 'row' })], [row], logs);
    expect(r.fills).toHaveLength(1);
    const f = r.fills[0];
    expect(f).toMatchObject({ setLogId: 'b', setIndex: 1, reps: 8, done: true, source: 'watch' });
    expect('weightKg' in f).toBe(false); // keeps user's 72.5
    expect(r.leftovers.map((l) => l.reason)).toEqual(['no_empty_slot']);
  });

  it('inserts new rows when no set_log exists', () => {
    const r = matchWatchSets([ws({ index: 0, category: 'row' })], [row], []);
    expect(r.fills[0]).toMatchObject({ setLogId: null, sessionExerciseId: 'row', setIndex: 0 });
  });

  it('ignores rest sets', () => {
    const sets = [
      ws({ index: 0, category: 'row' }),
      ws({ index: 1, setType: 'rest', category: 'row' }),
      ws({ index: 2, setType: 'rest' }),
    ];
    const r = matchWatchSets(sets, [row], []);
    expect(r.fills).toHaveLength(1);
    expect(r.ignoredRest).toBe(2);
    expect(r.leftovers).toHaveLength(0);
  });

  it('timed exercises get seconds instead of reps', () => {
    const r = matchWatchSets([ws({ index: 0, category: 'plank', durationS: 59.6, reps: null, weightKg: null })], [plank], []);
    expect(r.fills[0]).toMatchObject({ seconds: 60, rule: 'category' });
    expect(r.fills[0].reps).toBeUndefined();
  });

  it('chronological watch order maps to ascending set index', () => {
    const r = matchWatchSets(
      [ws({ index: 2, category: 'row', reps: 6 }), ws({ index: 0, category: 'row', reps: 10 })],
      [row],
      [],
    );
    expect(r.fills.map((f) => [f.setIndex, f.reps])).toEqual([[0, 10], [1, 6]]);
  });
});
