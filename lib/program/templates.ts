/**
 * Program templates. A template is a rotation of session templates repeated
 * for N weeks; sessions are numbered, never tied to weekdays.
 *
 * Default (v1's program): 4-day Upper A / Lower A / Upper B / Lower B × 16 weeks
 * = 64 sessions, deload in week 15.
 */
export interface TemplateExercise {
  exercise_id: string;
  sets: number;
  rep_lo: number;
  rep_hi: number;
  rest_s: number;
  /** Suggested starting load; null = pick a weight you can control. */
  start_kg: number | null;
}

export interface SessionTemplate {
  key: string;
  title: string;
  /** Short exercise category shown as "Day N · <category>". */
  category: string;
  cardio: string | null;
  exercises: TemplateExercise[];
}

export interface Phase {
  name: string;
  fromWeek: number;
  toWeek: number;
}

export interface ProgramTemplate {
  key: string;
  name: string;
  weeks: number;
  /** Session template keys in order; length = sessions per week. */
  rotation: string[];
  sessions: Record<string, SessionTemplate>;
  deloadWeeks: number[];
  /** Multiplier applied to target loads in deload weeks (same sets × reps). */
  deloadLoadFactor: number;
  phases: Phase[];
}

const t = (exercise_id: string, sets: number, rep_lo: number, rep_hi: number, rest_s: number, start_kg: number | null): TemplateExercise =>
  ({ exercise_id, sets, rep_lo, rep_hi, rest_s, start_kg });

export const FOUR_DAY_SPLIT: ProgramTemplate = {
  key: 'v1_4day_16wk',
  name: '16-week Upper/Lower',
  weeks: 16,
  rotation: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
  deloadWeeks: [15],
  deloadLoadFactor: 0.6,
  phases: [
    { name: 'Foundation', fromWeek: 1, toWeek: 4 },
    { name: 'Build', fromWeek: 5, toWeek: 8 },
    { name: 'Strength', fromWeek: 9, toWeek: 12 },
    { name: 'Peak', fromWeek: 13, toWeek: 16 },
  ],
  sessions: {
    upper_a: {
      key: 'upper_a',
      category: 'Upper · Push',
      title: 'Upper A — Push Focus',
      cardio: 'Incline treadmill walk (10–12% grade, 5.5 kph) — 15 min',
      exercises: [
        t('bench', 3, 8, 10, 90, 40),
        t('shoulder', 3, 10, 12, 75, 10),
        t('cablerow', 3, 10, 12, 75, null),
        t('latpull', 3, 10, 12, 75, null),
        t('tricep', 2, 12, 15, 60, null),
        t('bicep', 2, 12, 15, 60, 8),
      ],
    },
    lower_a: {
      key: 'lower_a',
      category: 'Lower · Quads',
      title: 'Lower A — Quad Focus',
      cardio: 'Stationary bike (moderate) — 15 min',
      exercises: [
        t('squat', 3, 8, 10, 120, 40),
        t('legprss', 3, 10, 12, 90, 100),
        t('rdl', 3, 10, 12, 90, 30),
        t('legcurl', 3, 12, 15, 60, null),
        t('calf', 3, 15, 20, 45, null),
        t('plank', 3, 30, 45, 45, null),
      ],
    },
    upper_b: {
      key: 'upper_b',
      category: 'Upper · Pull',
      title: 'Upper B — Pull Focus',
      cardio: 'Incline treadmill walk — 15 min',
      exercises: [
        t('bentrow', 3, 8, 10, 90, 35),
        t('incline', 3, 10, 12, 75, 12),
        t('facepull', 3, 12, 15, 60, null),
        t('lateral', 3, 12, 15, 60, 6),
        t('ohtri', 2, 12, 15, 60, null),
        t('hammer', 2, 12, 15, 60, 8),
      ],
    },
    lower_b: {
      key: 'lower_b',
      category: 'Lower · Hinge',
      title: 'Lower B — Hinge Focus',
      cardio: 'Stationary bike — 15 min',
      exercises: [
        t('deadlift', 3, 6, 8, 120, 50),
        t('bss', 3, 10, 10, 75, 0),
        t('hipthru', 3, 10, 12, 75, 40),
        t('legext', 3, 12, 15, 60, null),
        t('kneeraise', 3, 12, 15, 45, null),
      ],
    },
  },
};

export const TEMPLATES: Record<string, ProgramTemplate> = {
  [FOUR_DAY_SPLIT.key]: FOUR_DAY_SPLIT,
};

export const DEFAULT_TEMPLATE = FOUR_DAY_SPLIT;

export function phaseForWeek(template: ProgramTemplate, week: number): string {
  return template.phases.find((p) => week >= p.fromWeek && week <= p.toWeek)?.name ?? '';
}

/** Round to the nearest 2.5 kg (plate math). */
export function roundToPlate(kg: number): number {
  return Math.round(kg / 2.5) * 2.5;
}
