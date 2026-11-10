import { describe, it, expect } from 'vitest';
import { EXERCISES, EXERCISES_BY_ID, PRIMARY_EXERCISES, V1_SWAP_ALTERNATES, swapOptions } from '@/lib/exercises';
import { FOUR_DAY_SPLIT } from '@/lib/program';

// FIT SDK exercise_category names (Profile.xlsx).
const FIT_CATEGORIES = new Set(['bench_press', 'calf_raise', 'cardio', 'carry', 'chop', 'core', 'crunch', 'curl', 'deadlift', 'flye', 'hip_raise', 'hip_stability', 'hip_swing', 'hyperextension', 'lateral_raise', 'leg_curl', 'leg_raise', 'lunge', 'olympic_lift', 'plank', 'plyo', 'pull_up', 'push_up', 'row', 'shoulder_press', 'shoulder_stability', 'shrug', 'sit_up', 'squat', 'total_body', 'triceps_extension', 'warm_up', 'run']);

describe('exercise library', () => {
  it("has v1's 23 primaries", () => expect(PRIMARY_EXERCISES).toHaveLength(23));
  it('ids and names are unique', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    expect(new Set(EXERCISES.map((e) => e.name.toLowerCase())).size).toBe(EXERCISES.length);
  });
  it('every v1 SWAP_MAP alternate exists and shares its primary swap group', () => {
    expect(Object.keys(V1_SWAP_ALTERNATES).sort()).toEqual(PRIMARY_EXERCISES.map((e) => e.id).sort());
    for (const [primary, alts] of Object.entries(V1_SWAP_ALTERNATES)) {
      for (const alt of alts) {
        expect(EXERCISES_BY_ID[alt], alt).toBeDefined();
        expect(EXERCISES_BY_ID[alt].swap_group, `${primary} → ${alt}`).toBe(EXERCISES_BY_ID[primary].swap_group);
        expect(swapOptions(primary).map((e) => e.id)).toContain(alt);
      }
    }
  });
  it('every exercise belongs to a group that contains a primary', () => {
    const groups = new Set(PRIMARY_EXERCISES.map((e) => e.swap_group));
    for (const e of EXERCISES) expect(groups.has(e.swap_group), e.id).toBe(true);
  });
  it('rep ranges are sane and garmin fields use FIT names', () => {
    for (const e of EXERCISES) {
      expect(e.rep_lo).toBeGreaterThan(0);
      expect(e.rep_hi).toBeGreaterThanOrEqual(e.rep_lo);
      if (e.garmin_category) expect(FIT_CATEGORIES.has(e.garmin_category), e.id).toBe(true);
      if (e.garmin_subtype) expect(e.garmin_category, e.id).not.toBeNull();
    }
  });
  it('template only references library exercises', () => {
    for (const s of Object.values(FOUR_DAY_SPLIT.sessions)) for (const x of s.exercises) expect(EXERCISES_BY_ID[x.exercise_id]).toBeDefined();
  });
});
