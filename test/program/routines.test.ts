import { describe, it, expect } from 'vitest';
import {
  DAY_ROUTINES,
  DEFAULT_TEMPLATE,
  ROUTINE_ITEMS,
  defaultRoutineOpen,
  rampUpSets,
  routineItems,
  routineMinutes,
  RAMP_SET_S,
  BAR_KG,
  type RoutineOpenInput,
} from '@/lib/program';
import { EXERCISES } from '@/lib/exercises/seed';
import { NO_VIDEO, VIDEOS, YOUTUBE_ID_RE, embedUrl, thumbnailUrl, videoFor, watchUrl } from '@/lib/exercises/videos';

describe('routines data', () => {
  const templateKeys = Object.keys(DEFAULT_TEMPLATE.sessions);

  it('every day template has a warm-up and a cool-down', () => {
    expect(templateKeys.sort()).toEqual(['lower_a', 'lower_b', 'upper_a', 'upper_b']);
    for (const key of templateKeys) {
      expect(routineItems(key, 'warmup').length).toBeGreaterThanOrEqual(3);
      expect(routineItems(key, 'cooldown').length).toBeGreaterThanOrEqual(3);
    }
    expect(Object.keys(DAY_ROUTINES).sort()).toEqual(templateKeys.sort());
  });

  it('item ids are unique, prefixed by kind, and never collide with library exercises', () => {
    const ids = Object.keys(ROUTINE_ITEMS);
    expect(new Set(ids).size).toBe(ids.length);
    const exerciseIds = new Set(EXERCISES.map((e) => e.id));
    for (const [id, item] of Object.entries(ROUTINE_ITEMS)) {
      expect(item.id).toBe(id);
      expect(id).toMatch(/^(wu|cd)-/);
      expect(exerciseIds.has(id)).toBe(false);
      expect(item.name && item.dose && item.cue).toBeTruthy();
      expect(item.est_s).toBeGreaterThan(0);
    }
  });

  it('routines reference existing items, with no duplicates within a routine, and every item is used', () => {
    const used = new Set<string>();
    for (const [key, r] of Object.entries(DAY_ROUTINES)) {
      for (const kind of ['warmup', 'cooldown'] as const) {
        const ids = r[kind];
        expect(new Set(ids).size, `${key} ${kind}`).toBe(ids.length);
        for (const id of ids) {
          expect(ROUTINE_ITEMS[id], id).toBeDefined();
          expect(id.startsWith(kind === 'warmup' ? 'wu-' : 'cd-')).toBe(true);
          used.add(id);
        }
      }
      // Warm-up opens with a general raise.
      expect(['wu-row-easy', 'wu-bike-easy']).toContain(r.warmup[0]);
    }
    expect([...used].sort()).toEqual(Object.keys(ROUTINE_ITEMS).sort());
  });

  it('warm-up is about 8–10 min with ramp-up sets; cool-down about 5 min', () => {
    for (const key of Object.keys(DAY_ROUTINES)) {
      const ramp = rampUpSets(60, { barKg: BAR_KG }).length * RAMP_SET_S;
      const wu = routineMinutes(routineItems(key, 'warmup'), ramp);
      const cd = routineMinutes(routineItems(key, 'cooldown'));
      expect(wu, key).toBeGreaterThanOrEqual(8);
      expect(wu, key).toBeLessThanOrEqual(10);
      expect(cd, key).toBeGreaterThanOrEqual(4);
      expect(cd, key).toBeLessThanOrEqual(6);
    }
  });
});

describe('videos', () => {
  const expected = [...EXERCISES.map((e) => e.id), ...Object.keys(ROUTINE_ITEMS)];

  it('covers all 85 exercises and every routine item (or lists them as intentionally absent)', () => {
    expect(EXERCISES).toHaveLength(85);
    for (const id of expected) {
      expect(!!VIDEOS[id] || NO_VIDEO.includes(id), id).toBe(true);
      expect(!!VIDEOS[id] && NO_VIDEO.includes(id), `${id} both mapped and absent`).toBe(false);
    }
    for (const id of Object.keys(VIDEOS)) expect(expected, id).toContain(id);
  });

  it('every entry is a well-formed YouTube id with channel and title', () => {
    for (const [key, v] of Object.entries(VIDEOS)) {
      expect(v.id, key).toMatch(YOUTUBE_ID_RE);
      expect(v.channel.trim(), key).not.toBe('');
      expect(v.title.trim(), key).not.toBe('');
      expect(watchUrl(v.id)).toBe(`https://www.youtube.com/watch?v=${v.id}`);
    }
  });

  it('builds privacy-friendly URLs and hides unknown ids', () => {
    expect(embedUrl('abcdefghijk')).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/abcdefghijk\?/);
    expect(thumbnailUrl('abcdefghijk')).toBe('https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
    expect(videoFor('no-such-exercise')).toBeNull();
    expect(videoFor(null)).toBeNull();
    expect(videoFor('bench')?.id).toBe(VIDEOS.bench.id);
  });
});

describe('rampUpSets', () => {
  it('ramps ~50/70/85 % of the working weight, rounded to the plate, after the empty bar', () => {
    expect(rampUpSets(100, { barKg: 20 })).toEqual([
      { kg: 20, reps: 10, pct: null, emptyBar: true },
      { kg: 50, reps: 8, pct: 0.5, emptyBar: false },
      { kg: 70, reps: 5, pct: 0.7, emptyBar: false },
      { kg: 85, reps: 3, pct: 0.85, emptyBar: false },
    ]);
  });

  it('rounds to 2.5 kg', () => {
    const kgs = rampUpSets(62.5, { barKg: 20 }).map((s) => s.kg);
    // 31.25 → 32.5 (round half up), 43.75 → 45, 53.125 → 52.5
    expect(kgs).toEqual([20, 32.5, 45, 52.5]);
    for (const k of kgs) expect((k! * 10) % 25).toBe(0);
  });

  it('never drops below the bar, never repeats, stays under the working weight', () => {
    // 40 kg bench: 50 % = 20 = bar (deduped), 70 % = 27.5, 85 % = 35
    expect(rampUpSets(40, { barKg: 20 }).map((s) => [s.kg, s.reps])).toEqual([[20, 10], [27.5, 5], [35, 3]]);
    // 25 kg: everything rounds to ≤ bar or ≥ working → just the bar
    expect(rampUpSets(25, { barKg: 20 }).map((s) => s.kg)).toEqual([20, 22.5]);
    expect(rampUpSets(20, { barKg: 20 }).map((s) => s.kg)).toEqual([20]);
    for (const w of [22.5, 30, 47.5, 87.5, 142.5, 200]) {
      const sets = rampUpSets(w, { barKg: 20 });
      const kgs = sets.map((s) => s.kg!);
      expect(kgs[0]).toBe(20);
      for (let i = 1; i < kgs.length; i++) {
        expect(kgs[i]).toBeGreaterThan(kgs[i - 1]);
        expect(kgs[i]).toBeLessThan(w);
      }
    }
  });

  it('shows the empty bar when there is no working weight yet', () => {
    for (const w of [null, undefined, 0, NaN, -5]) {
      expect(rampUpSets(w, { barKg: 20 })).toEqual([{ kg: 20, reps: 10, pct: null, emptyBar: true }]);
    }
  });

  it('works without a bar (dumbbell swaps): no empty-bar set, light set when no weight', () => {
    expect(rampUpSets(null)).toEqual([{ kg: null, reps: 10, pct: null, emptyBar: false }]);
    expect(rampUpSets(30).map((s) => [s.kg, s.reps, s.emptyBar])).toEqual([[15, 8, false], [20, 5, false], [25, 3, false]]);
  });
});

describe('defaultRoutineOpen', () => {
  const base: RoutineOpenInput = { readOnly: false, status: 'up_next', anyWorkingDone: false, allWorkingDone: false };

  it('warm-up: open while up next and before the first working tick, then collapsed', () => {
    expect(defaultRoutineOpen('warmup', base)).toBe(true);
    expect(defaultRoutineOpen('warmup', { ...base, status: 'in_progress' })).toBe(true);
    expect(defaultRoutineOpen('warmup', { ...base, status: 'in_progress', anyWorkingDone: true })).toBe(false);
    expect(defaultRoutineOpen('warmup', { ...base, status: 'complete', anyWorkingDone: true, allWorkingDone: true })).toBe(false);
  });

  it('cool-down: collapsed until every working set is done, then open', () => {
    expect(defaultRoutineOpen('cooldown', base)).toBe(false);
    expect(defaultRoutineOpen('cooldown', { ...base, status: 'in_progress', anyWorkingDone: true })).toBe(false);
    expect(defaultRoutineOpen('cooldown', { ...base, status: 'in_progress', anyWorkingDone: true, allWorkingDone: true })).toBe(true);
  });

  it('preview / locked: both collapsed', () => {
    for (const kind of ['warmup', 'cooldown'] as const) {
      expect(defaultRoutineOpen(kind, { ...base, readOnly: true })).toBe(false);
      expect(defaultRoutineOpen(kind, { ...base, status: 'locked' })).toBe(false);
      expect(defaultRoutineOpen(kind, { ...base, readOnly: true, status: 'in_progress', allWorkingDone: true })).toBe(false);
    }
  });
});
