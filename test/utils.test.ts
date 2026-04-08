import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  dk,
  getProgramWeeks,
  getWeekNum,
  getPhaseInfo,
  getTargets,
  calcTDEE,
  computeTargetsFromTDEE,
  todayIsGymDay,
  isWoDone,
  defaultSettings,
  getDayDateInWeek,
  getWorkoutMap,
} from '@/lib/utils';
import { WORKOUTS } from '@/lib/constants';
import type { Settings, DayData, AIPlan } from '@/lib/types';

// Freeze "today" so date-dependent tests are deterministic.
// 2026-04-08 is a Wednesday.
const FROZEN_NOW = new Date('2026-04-08T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...defaultSettings(),
    startDate: '2026-04-08',
    gymDays: ['monday', 'tuesday', 'wednesday', 'thursday'],
    cals_gym: 2100,
    cals_rest: 1850,
    protein: 155,
    fat: 70,
    weight_start: 80,
    height: 175,
    programWeeks: 16,
    onboarded: true,
    ...overrides,
  } as Settings;
}

describe('dk (date key)', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(dk(new Date('2026-04-08T12:00:00Z'))).toBe('2026-04-08');
  });
});

describe('getProgramWeeks', () => {
  it('defaults to 16 weeks when not set', () => {
    expect(getProgramWeeks(null)).toBe(16);
    expect(getProgramWeeks(makeSettings({ programWeeks: undefined }))).toBe(16);
  });

  it('honors custom program length', () => {
    expect(getProgramWeeks(makeSettings({ programWeeks: 8 }))).toBe(8);
    expect(getProgramWeeks(makeSettings({ programWeeks: 20 }))).toBe(20);
  });
});

describe('getWeekNum', () => {
  it('returns 1 on program start day', () => {
    expect(getWeekNum(makeSettings({ startDate: '2026-04-08' }))).toBe(1);
  });

  it('returns 2 after 7 days', () => {
    expect(getWeekNum(makeSettings({ startDate: '2026-04-01' }))).toBe(2);
  });

  it('returns 3 after 14 days', () => {
    expect(getWeekNum(makeSettings({ startDate: '2026-03-25' }))).toBe(3);
  });

  it('caps at totalWeeks when program is over', () => {
    expect(
      getWeekNum(makeSettings({ startDate: '2025-01-01', programWeeks: 16 })),
    ).toBe(16);
  });

  it('clamps to 1 when start is in the future', () => {
    expect(getWeekNum(makeSettings({ startDate: '2030-01-01' }))).toBe(1);
  });
});

describe('getPhaseInfo', () => {
  it.each([
    [1, 16, 'Foundation Phase'],
    [4, 16, 'Foundation Phase'],
    [5, 16, 'Build Phase'],
    [8, 16, 'Build Phase'],
    [9, 16, 'Strength Phase'],
    [12, 16, 'Strength Phase'],
    [13, 16, 'Peak Phase'],
    [16, 16, 'Peak Phase'],
  ])('week %i of 16 → %s', (week, total, phase) => {
    expect(getPhaseInfo(week, total).phase).toBe(phase);
  });

  it('handles 8-week program quartiles', () => {
    expect(getPhaseInfo(1, 8).phase).toBe('Foundation Phase');
    expect(getPhaseInfo(3, 8).phase).toBe('Build Phase');
    expect(getPhaseInfo(5, 8).phase).toBe('Strength Phase');
    expect(getPhaseInfo(7, 8).phase).toBe('Peak Phase');
  });

  it('returns icon + desc + weeks label for every phase', () => {
    const info = getPhaseInfo(1, 16);
    expect(info.icon).toBeTruthy();
    expect(info.desc).toBeTruthy();
    expect(info.weeks).toMatch(/\d+–\d+/);
  });
});

describe('calcTDEE + computeTargetsFromTDEE', () => {
  it('returns sensible TDEE for an 80kg/175cm person', () => {
    const tdee = calcTDEE(80, 175);
    expect(tdee).toBeGreaterThan(2000);
    expect(tdee).toBeLessThan(3200);
  });

  it('derives gym cals > rest cals', () => {
    const t = computeTargetsFromTDEE(80, 175);
    expect(t.cals_gym).toBeGreaterThan(t.cals_rest);
  });

  it('scales protein with bodyweight (1.8 g/kg)', () => {
    expect(computeTargetsFromTDEE(70, 175).protein).toBe(Math.round(70 * 1.8));
    expect(computeTargetsFromTDEE(90, 175).protein).toBe(Math.round(90 * 1.8));
  });
});

describe('getTargets', () => {
  it('returns gym calories on gym day', () => {
    const s = makeSettings({ cals_gym: 2100, cals_rest: 1850 });
    expect(getTargets(s, true).calories).toBe(2100);
    expect(getTargets(s, false).calories).toBe(1850);
  });

  it('derives carbs from remaining calories after protein + fat', () => {
    const s = makeSettings({ cals_gym: 2100, protein: 155, fat: 70 });
    const t = getTargets(s, true);
    // 2100 - 155*4 - 70*9 = 2100 - 620 - 630 = 850 / 4 ≈ 213
    expect(t.carbs).toBe(213);
  });

  it('floors carbs at 30g', () => {
    const s = makeSettings({ cals_gym: 500, protein: 100, fat: 40 });
    expect(getTargets(s, true).carbs).toBe(30);
  });

  it('falls back to defaults when settings is null', () => {
    const t = getTargets(null, true);
    expect(t.calories).toBeGreaterThan(0);
    expect(t.protein).toBeGreaterThan(0);
  });
});

describe('todayIsGymDay', () => {
  it('returns true when today is in gymDays (frozen to Wednesday)', () => {
    expect(
      todayIsGymDay(makeSettings({ gymDays: ['monday', 'wednesday', 'friday'] })),
    ).toBe(true);
  });

  it('returns false when today is not in gymDays', () => {
    expect(
      todayIsGymDay(makeSettings({ gymDays: ['monday', 'tuesday', 'thursday'] })),
    ).toBe(false);
  });
});

describe('isWoDone', () => {
  const emptyDay: DayData = { wo: {}, check: {}, meals: [], notes: '' };

  it('returns false for an empty day', () => {
    expect(isWoDone('monday', emptyDay)).toBe(false);
  });

  it('returns false when only some sets are done', () => {
    const partial: DayData = {
      ...emptyDay,
      wo: { bench: { sets: [{ done: true, weight: 40, reps: 10 }] } },
    };
    expect(isWoDone('monday', partial)).toBe(false);
  });

  it('returns false when dayName has no workout', () => {
    expect(isWoDone('sunday', emptyDay)).toBe(false);
  });
});

// ─── getDayDateInWeek ──────────────────────────────────────────
// Frozen date: 2026-04-08 (Wednesday). startDate also '2026-04-08' → week 1.
// Tests use getDay() (local, timezone-stable) rather than dk() (UTC ISO) to
// avoid off-by-one errors when the local timezone is ahead of UTC.

describe('getDayDateInWeek', () => {
  it('maps monday workout key to a Monday', () => {
    const s = makeSettings({ startDate: '2026-04-08', gymDays: ['monday', 'tuesday', 'wednesday', 'thursday'] });
    expect(getDayDateInWeek('monday', s).getDay()).toBe(1);
  });

  it('maps wednesday workout key to a Wednesday', () => {
    const s = makeSettings({ startDate: '2026-04-08', gymDays: ['monday', 'tuesday', 'wednesday', 'thursday'] });
    expect(getDayDateInWeek('wednesday', s).getDay()).toBe(3);
  });

  it('maps thursday workout key to a Thursday', () => {
    const s = makeSettings({ startDate: '2026-04-08', gymDays: ['monday', 'tuesday', 'wednesday', 'thursday'] });
    expect(getDayDateInWeek('thursday', s).getDay()).toBe(4);
  });

  it('all four workout keys map to their respective gym days', () => {
    // startDate is Wednesday; the function assigns each key to the gym day in the current cycle
    const s = makeSettings({ startDate: '2026-04-08', gymDays: ['monday', 'tuesday', 'wednesday', 'thursday'] });
    expect(getDayDateInWeek('monday', s).getDay()).toBe(1);
    expect(getDayDateInWeek('tuesday', s).getDay()).toBe(2);
    expect(getDayDateInWeek('wednesday', s).getDay()).toBe(3);
    expect(getDayDateInWeek('thursday', s).getDay()).toBe(4);
  });

  it('clamps to last gym day when workout key position exceeds gym day count', () => {
    // 2-day schedule, thursday is position 3 in WORKOUTS → clamps to friday (last of sorted [monday, friday])
    const s = makeSettings({ startDate: '2026-04-08', gymDays: ['monday', 'friday'] });
    expect(getDayDateInWeek('thursday', s).getDay()).toBe(5); // Friday
  });

  it('same workout key always maps to the same day-of-week regardless of week number', () => {
    // week 1 (startDate = today) and week 2 (startDate 7 days ago) both produce a Monday for 'monday'
    const week1 = makeSettings({ startDate: '2026-04-08', gymDays: ['monday', 'tuesday', 'wednesday', 'thursday'] });
    const week2 = makeSettings({ startDate: '2026-04-01', gymDays: ['monday', 'tuesday', 'wednesday', 'thursday'] });
    expect(getDayDateInWeek('monday', week1).getDay()).toBe(1);
    expect(getDayDateInWeek('monday', week2).getDay()).toBe(1);
  });
});

// ─── getWorkoutMap ─────────────────────────────────────────────

function makeAIPlan(gymDays: string[]): AIPlan {
  const days = gymDays.map((dayName, i) => ({
    day_label: `AI Day ${i + 1}`,
    focus: 'Test focus',
    exercises: [
      {
        id: `ex_${i}`,
        name: `Exercise ${i + 1}`,
        sets: 3,
        reps_low: 8,
        reps_high: 12,
        rest: '90s',
        starting_load_kg: 40,
        coaching_cue: 'Stay tight.',
        is_timed: false,
      },
    ],
    cardio: '15 min walk',
  }));
  return {
    daily_targets: { gym_day_calories: 2100, rest_day_calories: 1850, protein_g: 155, carbs_g_gym: 200, carbs_g_rest: 160, fat_g: 70 },
    tdee_estimate: 2500,
    weekly_weight_change_target_kg: -0.25,
    expected_weight_in_program_end_kg: 76,
    cardio_recommendation: { gym_days: '15 min', rest_days: 'walk', weekly_steps_target: 8000 },
    nutrition_principles: [],
    foods_to_prioritize: [],
    foods_to_limit: [],
    deficit_strategy: 'moderate',
    habit_priorities: [],
    program_notes: '',
    workout_plan: { days, progression_note: 'Add weight weekly' },
    phase_targets: { weeks_1_to_quarter: '', weeks_quarter_to_half: '', weeks_half_to_three_quarter: '', weeks_three_quarter_to_end: '' },
  };
}

describe('getWorkoutMap', () => {
  it('returns WORKOUTS when settings is null', () => {
    expect(getWorkoutMap(null)).toEqual(WORKOUTS);
  });

  it('returns WORKOUTS when aiPlan is undefined', () => {
    expect(getWorkoutMap(makeSettings())).toEqual(WORKOUTS);
  });

  it('returns WORKOUTS when aiPlan.workout_plan.days is empty', () => {
    const aiPlan = makeAIPlan([]);
    const s = makeSettings({ aiPlan });
    expect(getWorkoutMap(s)).toEqual(WORKOUTS);
  });

  it('returns mapped AI exercises keyed by gym day when aiPlan has days', () => {
    const gymDays = ['monday', 'wednesday'];
    const aiPlan = makeAIPlan(gymDays);
    const s = makeSettings({ gymDays, aiPlan });
    const map = getWorkoutMap(s);

    // Should NOT be the default WORKOUTS
    expect(map).not.toEqual(WORKOUTS);
    // Keys should be sorted gym days
    expect(Object.keys(map)).toEqual(['monday', 'wednesday']);
  });

  it('maps day_label to template name', () => {
    const gymDays = ['monday', 'tuesday'];
    const aiPlan = makeAIPlan(gymDays);
    const s = makeSettings({ gymDays, aiPlan });
    const map = getWorkoutMap(s);

    expect(map['monday'].name).toBe('AI Day 1');
    expect(map['tuesday'].name).toBe('AI Day 2');
  });

  it('maps AI exercises fields correctly', () => {
    const gymDays = ['monday'];
    const aiPlan = makeAIPlan(gymDays);
    const s = makeSettings({ gymDays, aiPlan });
    const map = getWorkoutMap(s);
    const ex = map['monday'].exercises[0];

    expect(ex.id).toBe('ex_0');
    expect(ex.name).toBe('Exercise 1');
    expect(ex.sets).toBe(3);
    expect(ex.lo).toBe(8);
    expect(ex.hi).toBe(12);
    expect(ex.rest).toBe('90s');
    expect(ex.load).toBe(40);
    expect(ex.cue).toBe('Stay tight.');
    expect(ex.isTime).toBe(false);
  });

  it('sorts gym days correctly when order is non-alphabetical', () => {
    // thursday sorts before monday alphabetically but not by DAYS order
    const gymDays = ['thursday', 'monday'];
    const aiPlan = makeAIPlan(gymDays);
    const s = makeSettings({ gymDays, aiPlan });
    const map = getWorkoutMap(s);
    // sorted by DAYS index: monday(1) < thursday(4) → monday gets AI Day 1
    expect(map['monday'].name).toBe('AI Day 1');
    expect(map['thursday'].name).toBe('AI Day 2');
  });
});
