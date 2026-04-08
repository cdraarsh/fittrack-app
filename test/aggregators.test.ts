import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computePRs,
  calcConsistency,
  computeStreaks,
  computeCalorieBank,
  computeWeeklySummary,
  dk,
  defaultSettings,
} from '@/lib/utils';
import { WORKOUTS } from '@/lib/constants';
import type { Settings, DayData, WeightEntry } from '@/lib/types';

// Frozen to Wednesday 2026-04-08 — consistent across all aggregator tests.
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
    startDate: '2026-01-01',
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

/** Build a DayData where every exercise in the template has all sets marked done. */
function fullyDoneDay(dayName: string): DayData {
  const wo = WORKOUTS[dayName];
  const woData: DayData['wo'] = {};
  if (wo) {
    for (const ex of wo.exercises) {
      woData[ex.id] = {
        sets: Array.from({ length: ex.sets }, () => ({
          done: true,
          weight: ex.load ?? 20,
          reps: ex.lo,
        })),
      };
    }
  }
  return { wo: woData, check: {}, meals: [], notes: '' };
}

/** Build an empty day shell. */
function emptyDay(): DayData {
  return { wo: {}, check: {}, meals: [], notes: '' };
}

/** Offset a YYYY-MM-DD key by N days relative to FROZEN_NOW. */
function dayKey(offset: number): string {
  const d = new Date(FROZEN_NOW);
  d.setDate(d.getDate() + offset);
  return dk(d);
}

// ─── computePRs ────────────────────────────────────────────────
describe('computePRs', () => {
  it('returns empty object when no data', () => {
    expect(computePRs({})).toEqual({});
  });

  it('ignores sets that are not marked done', () => {
    const cache = {
      [dayKey(0)]: {
        ...emptyDay(),
        wo: { bench: { sets: [{ done: false, weight: 100, reps: 5 }] } },
      },
    };
    expect(computePRs(cache)).toEqual({});
  });

  it('ignores sets with zero or negative weight', () => {
    const cache = {
      [dayKey(0)]: {
        ...emptyDay(),
        wo: {
          bench: {
            sets: [
              { done: true, weight: 0, reps: 10 },
              { done: true, weight: -5, reps: 10 },
            ],
          },
        },
      },
    };
    expect(computePRs(cache)).toEqual({});
  });

  it('tracks the heaviest weight per exercise', () => {
    const cache = {
      [dayKey(-7)]: {
        ...emptyDay(),
        wo: { bench: { sets: [{ done: true, weight: 50, reps: 8 }] } },
      },
      [dayKey(-3)]: {
        ...emptyDay(),
        wo: { bench: { sets: [{ done: true, weight: 60, reps: 6 }] } },
      },
      [dayKey(0)]: {
        ...emptyDay(),
        wo: { bench: { sets: [{ done: true, weight: 55, reps: 8 }] } },
      },
    };
    const prs = computePRs(cache);
    expect(prs.bench.weight).toBe(60);
    expect(prs.bench.reps).toBe(6);
    expect(prs.bench.date).toBe(dayKey(-3));
    expect(prs.bench.name).toBe('Flat Barbell Bench Press');
  });

  it('tracks PRs across multiple exercises independently', () => {
    const cache = {
      [dayKey(0)]: {
        ...emptyDay(),
        wo: {
          bench: { sets: [{ done: true, weight: 60, reps: 8 }] },
          squat: { sets: [{ done: true, weight: 100, reps: 5 }] },
        },
      },
    };
    const prs = computePRs(cache);
    expect(prs.bench.weight).toBe(60);
    expect(prs.squat.weight).toBe(100);
  });
});

// ─── calcConsistency ───────────────────────────────────────────
describe('calcConsistency', () => {
  it('returns 0% when no workouts logged', () => {
    const result = calcConsistency(makeSettings(), {});
    expect(result.completed).toBe(0);
    expect(result.pct).toBe(0);
    expect(result.scheduled).toBeGreaterThan(0);
  });

  it('counts scheduled gym days over the last 28 days', () => {
    // 4 gym days/week × 4 weeks = ~16 scheduled
    const result = calcConsistency(makeSettings(), {});
    expect(result.scheduled).toBeGreaterThanOrEqual(15);
    expect(result.scheduled).toBeLessThanOrEqual(17);
  });

  it('counts a fully-done workout as completed', () => {
    // 2026-04-06 was a Monday
    const mondayKey = dayKey(-2);
    const cache = { [mondayKey]: fullyDoneDay('monday') };
    const result = calcConsistency(makeSettings(), cache);
    expect(result.completed).toBe(1);
    expect(result.pct).toBeGreaterThan(0);
  });

  it('does not count partial workouts', () => {
    const mondayKey = dayKey(-2);
    const cache = {
      [mondayKey]: {
        ...emptyDay(),
        wo: { bench: { sets: [{ done: true, weight: 40, reps: 10 }] } }, // only 1 exercise
      },
    };
    const result = calcConsistency(makeSettings(), cache);
    expect(result.completed).toBe(0);
  });
});

// ─── computeStreaks ────────────────────────────────────────────
describe('computeStreaks', () => {
  it('returns zero streaks for empty cache', () => {
    const result = computeStreaks(makeSettings(), {});
    expect(result.dayStreak).toBe(0);
    expect(result.weekStreak).toBe(0);
  });

  it('counts consecutive days with any activity', () => {
    const cache = {
      [dayKey(0)]: { ...emptyDay(), meals: [{ name: 'Oats', protein: 10, carbs: 50, fat: 5, calories: 300 }] },
      [dayKey(-1)]: { ...emptyDay(), check: { water: 3 } },
      [dayKey(-2)]: { ...emptyDay(), meals: [{ name: 'Rice', protein: 5, carbs: 60, fat: 2, calories: 280 }] },
    };
    const result = computeStreaks(makeSettings(), cache);
    expect(result.dayStreak).toBe(3);
  });

  it('breaks streak on a day with no activity', () => {
    const cache = {
      [dayKey(0)]: { ...emptyDay(), meals: [{ name: 'X', protein: 1, carbs: 1, fat: 1, calories: 100 }] },
      // gap at day -1
      [dayKey(-2)]: { ...emptyDay(), meals: [{ name: 'Y', protein: 1, carbs: 1, fat: 1, calories: 100 }] },
    };
    const result = computeStreaks(makeSettings(), cache);
    expect(result.dayStreak).toBe(1);
  });

  it('breaks streak on a day that exists but has no activity flags', () => {
    const cache = {
      [dayKey(0)]: emptyDay(),
      [dayKey(-1)]: emptyDay(),
    };
    const result = computeStreaks(makeSettings(), cache);
    expect(result.dayStreak).toBe(0);
  });
});

// ─── computeCalorieBank ────────────────────────────────────────
describe('computeCalorieBank', () => {
  it('returns 7 days in the window', () => {
    const result = computeCalorieBank(makeSettings(), {});
    expect(result.days).toHaveLength(7);
  });

  it('marks gym days vs rest days correctly', () => {
    const result = computeCalorieBank(makeSettings(), {});
    // monday-thursday gym days
    const gymCount = result.days.filter(d => d.isGym).length;
    // 7-day window ending Wed 2026-04-08 → Thu-Fri-Sat-Sun-Mon-Tue-Wed → 4 gym days
    expect(gymCount).toBe(4);
  });

  it('uses gym budget for gym days and rest budget for rest days', () => {
    const result = computeCalorieBank(makeSettings({ cals_gym: 2100, cals_rest: 1850 }), {});
    const gymDay = result.days.find(d => d.isGym)!;
    const restDay = result.days.find(d => !d.isGym)!;
    expect(gymDay.budget).toBe(2100);
    expect(restDay.budget).toBe(1850);
  });

  it('computes bank balance only from logged days', () => {
    const cache: Record<string, DayData> = {
      [dayKey(0)]: {
        ...emptyDay(),
        meals: [{ name: 'Day', protein: 50, carbs: 200, fat: 60, calories: 1800 }],
      },
    };
    const result = computeCalorieBank(makeSettings({ cals_gym: 2100 }), cache);
    expect(result.loggedDays).toBe(1);
    // Wed is gym day → budget 2100 − 1800 = +300
    expect(result.bankBalance).toBe(300);
  });

  it('goes negative when over budget', () => {
    const cache: Record<string, DayData> = {
      [dayKey(0)]: {
        ...emptyDay(),
        meals: [{ name: 'Feast', protein: 100, carbs: 300, fat: 100, calories: 3000 }],
      },
    };
    const result = computeCalorieBank(makeSettings({ cals_gym: 2100 }), cache);
    expect(result.bankBalance).toBe(-900);
  });
});

// ─── computeWeeklySummary ──────────────────────────────────────
describe('computeWeeklySummary', () => {
  const weights: WeightEntry[] = [];

  it('returns zeros for empty cache', () => {
    const result = computeWeeklySummary(makeSettings(), {}, weights);
    expect(result.sessionsDone).toBe(0);
    expect(result.avgCals).toBe(null);
    expect(result.avgWater).toBe(null);
    expect(result.weightDelta).toBe(null);
    expect(result.bestLift).toBe(null);
  });

  it('schedules 4 sessions over a 7-day window with 4 gym days', () => {
    const result = computeWeeklySummary(makeSettings(), {}, weights);
    expect(result.sessionsScheduled).toBe(4);
  });

  it('counts completed sessions only when fully done', () => {
    const cache = {
      [dayKey(-2)]: fullyDoneDay('monday'),  // 2026-04-06 Mon
      [dayKey(-1)]: fullyDoneDay('tuesday'), // 2026-04-07 Tue
    };
    const result = computeWeeklySummary(makeSettings(), cache, weights);
    expect(result.sessionsDone).toBe(2);
  });

  it('averages calories across logged days', () => {
    const cache: Record<string, DayData> = {
      [dayKey(0)]: {
        ...emptyDay(),
        meals: [{ name: 'A', protein: 50, carbs: 200, fat: 60, calories: 2000 }],
      },
      [dayKey(-1)]: {
        ...emptyDay(),
        meals: [{ name: 'B', protein: 50, carbs: 200, fat: 60, calories: 1800 }],
      },
    };
    const result = computeWeeklySummary(makeSettings(), cache, weights);
    expect(result.avgCals).toBe(1900);
  });

  it('averages water across days with water > 0', () => {
    const cache: Record<string, DayData> = {
      [dayKey(0)]: { ...emptyDay(), check: { water: 7 } },
      [dayKey(-1)]: { ...emptyDay(), check: { water: 5 } },
      [dayKey(-2)]: { ...emptyDay(), check: { water: 0 } }, // excluded
    };
    const result = computeWeeklySummary(makeSettings(), cache, weights);
    expect(result.avgWater).toBe(6);
  });

  it('computes weight delta between first and last entry of the week', () => {
    const weekEntries: WeightEntry[] = [
      { date: dayKey(-6), weight: 80.0 },
      { date: dayKey(-3), weight: 79.5 },
      { date: dayKey(0),  weight: 79.2 },
    ];
    const result = computeWeeklySummary(makeSettings(), {}, weekEntries);
    expect(result.weightDelta).toBeCloseTo(-0.8, 1);
  });

  it('returns null weight delta when fewer than 2 entries', () => {
    const result = computeWeeklySummary(makeSettings(), {}, [{ date: dayKey(0), weight: 80 }]);
    expect(result.weightDelta).toBe(null);
  });

  it('tracks best lift by volume (weight × reps)', () => {
    const cache = {
      [dayKey(-2)]: {
        ...emptyDay(),
        wo: {
          bench: { sets: [{ done: true, weight: 60, reps: 10 }] }, // vol 600
          squat: { sets: [{ done: true, weight: 100, reps: 5 }] }, // vol 500
        },
      },
    };
    const result = computeWeeklySummary(makeSettings(), cache, weights);
    expect(result.bestLift?.weight).toBe(60);
    expect(result.bestLift?.reps).toBe(10);
    expect(result.bestLift?.name).toBe('Flat Barbell Bench Press');
  });
});
