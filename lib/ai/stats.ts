// ─── Stats pack ───────────────────────────────────────────────────────────────
// Every number the insight/coach model sees is computed here, purely, from
// plain rows. The model only writes words around these numbers.
// Target size: ~1–2K tokens when JSON-serialised (see statsPackToPrompt).

import type {
  BodyWeightRow,
  ExerciseRow,
  GarminDailyRow,
  ProgramSessionRow,
  SessionExerciseRow,
  SetLogRow,
  StatsInput,
} from './types';
import { dayInfo } from '@/lib/program/days';
import { prefillWeight } from '@/lib/program/routines';

// ─── Date helpers (YYYY-MM-DD, UTC arithmetic so DST never shifts a day) ─────

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Calendar date of an instant in a timezone (falls back to UTC on bad tz). */
export function localDate(instant: Date | string, timeZone?: string | null): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

const round = (n: number, dp = 1) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

// ─── e1RM ─────────────────────────────────────────────────────────────────────

/** Epley estimated 1RM. reps=1 → the weight itself. Returns null for unusable sets. */
export function epley1RM(weightKg: number | null | undefined, reps: number | null | undefined): number | null {
  if (!isNum(weightKg) || !isNum(reps) || weightKg <= 0 || reps <= 0) return null;
  if (reps > 12) return null; // Epley is unreliable for high-rep sets
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

const MAIN_LIFT_PATTERNS: RegExp[] = [
  /squat/i,
  /deadlift/i,
  /bench/i,
  /overhead press|\bohp\b|military press|shoulder press/i,
];

/** Main lifts: explicit ids, else first exercise matching each main pattern, else none. */
export function detectMainLifts(exercises: ExerciseRow[], explicit?: string[]): ExerciseRow[] {
  if (explicit?.length) {
    return explicit
      .map(id => exercises.find(e => e.id === id))
      .filter((e): e is ExerciseRow => !!e);
  }
  const out: ExerciseRow[] = [];
  for (const re of MAIN_LIFT_PATTERNS) {
    const hit = exercises
      .filter(e => !e.is_timed && re.test(e.name) && !out.includes(e))
      // prefer the plainest name ("Back Squat" over "Bulgarian Split Squat")
      .sort((a, b) => a.name.length - b.name.length)[0];
    if (hit) out.push(hit);
  }
  return out;
}

// ─── Phase ────────────────────────────────────────────────────────────────────

export function phaseFor(week: number | null, totalWeeks: number | null): string | null {
  if (!isNum(week) || !isNum(totalWeeks) || totalWeeks <= 0) return null;
  const f = (week - 1) / totalWeeks;
  if (f < 0.25) return 'foundation';
  if (f < 0.5) return 'build';
  if (f < 0.75) return 'strength';
  return 'peak';
}

// ─── Stats pack shape ─────────────────────────────────────────────────────────

export interface TopSet { kg: number | null; reps: number | null; seconds: number | null }

export interface StatsPack {
  date: string;
  program: null | {
    name: string | null;
    completed: number;
    total: number;
    nextSession: null | {
      seq: number;
      week: number | null;
      title: string | null;
      exercises: { name: string; sets: number | null; reps: string | null; targetKg: number | null }[];
    };
    week: number | null;
    totalWeeks: number | null;
    phase: string | null;
    daysSinceLast: number | null;
  };
  lastSession: null | {
    seq: number;
    title: string | null;
    date: string | null;
    exercises: {
      name: string;
      top: TopSet | null;
      setsDone: number;
      setsPrescribed: number | null;
      misses: number; // prescribed sets not done, or done below rep_lo
    }[];
  };
  trends: {
    e1rm: { name: string; weekly: (number | null)[]; changePct: number | null }[]; // oldest → newest, 4 weeks
    weeklySets: Record<string, number>; // done sets per pattern, last 7 days
    adherence: null | { completed: number; expected: number; pct: number };
  };
  recovery: null | {
    date: string;
    stale: boolean; // latest daily older than yesterday
    metrics: Record<
      'sleepH' | 'restingHr' | 'hrv' | 'bodyBattery' | 'stress',
      { value: number | null; avg7: number | null; avg28: number | null }
    >;
    readiness: 'good' | 'moderate' | 'low';
    flags: string[];
  };
  bodyweight: null | {
    latest: number;
    latestDate: string;
    avg7: number | null;
    prevAvg7: number | null;
    change: number | null; // avg7 - prevAvg7, kg
  };
}

// ─── Builders ─────────────────────────────────────────────────────────────────

const isDone = (s: ProgramSessionRow) => s.status === 'complete' || !!s.completed_at;

function setDate(set: SetLogRow, session: ProgramSessionRow | undefined): string | null {
  if (session?.completed_at) return session.completed_at.slice(0, 10);
  if (set.updated_at) return set.updated_at.slice(0, 10);
  return null;
}

interface Indexed {
  sessionById: Map<string, ProgramSessionRow>;
  seById: Map<string, SessionExerciseRow>;
  exById: Map<string, ExerciseRow>;
}

function index(input: StatsInput): Indexed {
  return {
    sessionById: new Map(input.sessions.map(s => [s.id, s])),
    seById: new Map(input.sessionExercises.map(se => [se.id, se])),
    exById: new Map(input.exercises.map(e => [e.id, e])),
  };
}

function buildProgram(input: StatsInput, idx: Indexed): StatsPack['program'] {
  const { program, sessions, today } = input;
  if (!program && sessions.length === 0) return null;
  const sorted = [...sessions].sort((a, b) => a.seq - b.seq);
  const done = sorted.filter(isDone);
  const next = sorted.find(s => !isDone(s)) ?? null;
  const total =
    sorted.length ||
    (isNum(program?.weeks) && isNum(program?.sessions_per_week) ? program!.weeks! * program!.sessions_per_week! : 0);
  const lastDates = done.map(s => s.completed_at?.slice(0, 10)).filter((d): d is string => !!d).sort();
  const lastDate = lastDates[lastDates.length - 1];
  const week = next?.week ?? done[done.length - 1]?.week ?? null;
  const totalWeeks = program?.weeks ?? (sorted.length ? Math.max(...sorted.map(s => s.week ?? 0)) || null : null);

  let nextSession: NonNullable<StatsPack['program']>['nextSession'] = null;
  if (next) {
    const ses = input.sessionExercises
      .filter(se => se.session_id === next.id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    nextSession = {
      seq: next.seq,
      week: next.week,
      // Same name the app shows ("Day 2 · Lower · Quads").
      title: next.template_key ? dayInfo({ seq: next.seq, template_key: next.template_key, title: next.title }).label : next.title,
      exercises: ses.map(se => ({
        name: idx.exById.get(se.exercise_id)?.name ?? 'Unknown',
        sets: se.sets,
        reps: repRange(se.rep_lo, se.rep_hi),
        // Same target the logger prefills: last done weight (≈60% on deload), else the template start.
        targetKg: prefillWeight(lastDoneWeight(input, idx, se.exercise_id, next.id), !!next.is_deload, se.target_kg),
      })),
    };
  }

  return {
    name: program?.name ?? null,
    completed: done.length,
    total,
    nextSession,
    week,
    totalWeeks,
    phase: phaseFor(week, totalWeeks),
    daysSinceLast: lastDate ? daysBetween(lastDate, today) : null,
  };
}

/** Most recent done weight for an exercise, outside the given session (matches the logger's prefill). */
function lastDoneWeight(input: StatsInput, idx: Indexed, exerciseId: string, excludeSessionId: string): number | null {
  let best: { kg: number; at: string } | null = null;
  for (const s of input.setLogs) {
    if (!s.done || !isNum(s.weight_kg) || s.weight_kg <= 0) continue;
    const se = idx.seById.get(s.session_exercise_id);
    if (!se || se.exercise_id !== exerciseId || se.session_id === excludeSessionId) continue;
    const at = s.updated_at ?? '';
    if (!best || at > best.at) best = { kg: s.weight_kg, at };
  }
  return best?.kg ?? null;
}

function repRange(lo: number | null, hi: number | null): string | null {
  if (isNum(lo) && isNum(hi)) return lo === hi ? `${lo}` : `${lo}-${hi}`;
  if (isNum(lo)) return `${lo}`;
  if (isNum(hi)) return `${hi}`;
  return null;
}

/** Heaviest set (by kg, then reps); timed exercises use longest hold. */
export function topSet(sets: SetLogRow[]): TopSet | null {
  const done = sets.filter(s => s.done);
  if (!done.length) return null;
  const best = [...done].sort(
    (a, b) =>
      (b.weight_kg ?? 0) - (a.weight_kg ?? 0) ||
      (b.reps ?? 0) - (a.reps ?? 0) ||
      (b.seconds ?? 0) - (a.seconds ?? 0),
  )[0];
  return { kg: best.weight_kg, reps: best.reps, seconds: best.seconds };
}

function buildLastSession(input: StatsInput, idx: Indexed): StatsPack['lastSession'] {
  const done = input.sessions.filter(isDone).sort((a, b) => b.seq - a.seq);
  const last = done[0];
  if (!last) return null;
  const ses = input.sessionExercises
    .filter(se => se.session_id === last.id)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return {
    seq: last.seq,
    title: last.title,
    date: last.completed_at?.slice(0, 10) ?? null,
    exercises: ses.map(se => {
      const sets = input.setLogs.filter(s => s.session_exercise_id === se.id);
      const doneSets = sets.filter(s => s.done);
      const below = isNum(se.rep_lo)
        ? doneSets.filter(s => isNum(s.reps) && s.reps < se.rep_lo!).length
        : 0;
      const notDone = isNum(se.sets) ? Math.max(0, se.sets - doneSets.length) : 0;
      return {
        name: idx.exById.get(se.exercise_id)?.name ?? 'Unknown',
        top: topSet(sets),
        setsDone: doneSets.length,
        setsPrescribed: se.sets,
        misses: below + notDone,
      };
    }),
  };
}

function buildE1rm(input: StatsInput, idx: Indexed): StatsPack['trends']['e1rm'] {
  const lifts = detectMainLifts(input.exercises, input.mainLiftIds);
  return lifts.map(lift => {
    // weekly[0] = 22–28 days ago … weekly[3] = last 7 days (including today)
    const weekly: (number | null)[] = [null, null, null, null];
    for (const s of input.setLogs) {
      if (!s.done) continue;
      const se = idx.seById.get(s.session_exercise_id);
      if (!se || se.exercise_id !== lift.id) continue;
      const date = setDate(s, idx.sessionById.get(se.session_id));
      if (!date) continue;
      const ago = daysBetween(date, input.today);
      if (ago < 0 || ago > 27) continue;
      const bucket = 3 - Math.floor(ago / 7);
      const e = epley1RM(s.weight_kg, s.reps);
      if (e !== null && (weekly[bucket] === null || e > weekly[bucket]!)) weekly[bucket] = e;
    }
    const present = weekly.filter((x): x is number => x !== null);
    const changePct =
      present.length >= 2 ? round(((present[present.length - 1] - present[0]) / present[0]) * 100) : null;
    return { name: lift.name, weekly: weekly.map(x => (x === null ? null : round(x))), changePct };
  });
}

function buildWeeklySets(input: StatsInput, idx: Indexed): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of input.setLogs) {
    if (!s.done) continue;
    const se = idx.seById.get(s.session_exercise_id);
    if (!se) continue;
    const date = setDate(s, idx.sessionById.get(se.session_id));
    if (!date) continue;
    const ago = daysBetween(date, input.today);
    if (ago < 0 || ago > 6) continue;
    const group = idx.exById.get(se.exercise_id)?.pattern || 'other';
    out[group] = (out[group] ?? 0) + 1;
  }
  return out;
}

/** Completed sessions in the last 28 days vs expected (sessions_per_week, prorated for a new program). */
export function adherence(input: StatsInput): StatsPack['trends']['adherence'] {
  const perWeek = input.program?.sessions_per_week;
  if (!isNum(perWeek) || perWeek <= 0) return null;
  const windowStart = addDays(input.today, -27);
  const start =
    input.program?.start_date && input.program.start_date > windowStart ? input.program.start_date : windowStart;
  const days = daysBetween(start, input.today) + 1;
  if (days <= 0) return null;
  const expected = Math.round((perWeek * days) / 7);
  const completed = input.sessions.filter(s => {
    const d = s.completed_at?.slice(0, 10);
    return isDone(s) && !!d && d >= start && d <= input.today;
  }).length;
  if (expected === 0) return { completed, expected, pct: completed > 0 ? 100 : 0 };
  return { completed, expected, pct: Math.min(100, Math.round((completed / expected) * 100)) };
}

type MetricKey = 'sleepH' | 'restingHr' | 'hrv' | 'bodyBattery' | 'stress';
const METRIC_GETTERS: Record<MetricKey, (d: GarminDailyRow) => number | null> = {
  sleepH: d => (isNum(d.sleep_s) ? d.sleep_s / 3600 : null),
  restingHr: d => d.resting_hr,
  hrv: d => d.hrv,
  bodyBattery: d => d.body_battery,
  stress: d => d.stress_avg,
};

/**
 * Recovery: latest daily vs 7-day and 28-day baselines. Baselines exclude the
 * latest day itself so today's value is compared against history.
 */
export function buildRecovery(dailies: GarminDailyRow[], today: string): StatsPack['recovery'] {
  const usable = dailies.filter(d => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const latest = usable[usable.length - 1];
  if (!latest) return null;
  const before = (n: number) => usable.filter(d => d.date < latest.date && d.date >= addDays(latest.date, -n));

  const metrics = {} as NonNullable<StatsPack['recovery']>['metrics'];
  for (const key of Object.keys(METRIC_GETTERS) as MetricKey[]) {
    const get = METRIC_GETTERS[key];
    const vals = (rows: GarminDailyRow[]) => rows.map(get).filter(isNum);
    const v = get(latest);
    const a7 = mean(vals(before(7)));
    const a28 = mean(vals(before(28)));
    metrics[key] = {
      value: isNum(v) ? round(v) : null,
      avg7: a7 === null ? null : round(a7),
      avg28: a28 === null ? null : round(a28),
    };
  }

  const flags: string[] = [];
  const m = metrics;
  if (m.hrv.value !== null && m.hrv.avg28 !== null && m.hrv.value < m.hrv.avg28 * 0.9) flags.push('hrv_below_baseline');
  if (m.restingHr.value !== null && m.restingHr.avg28 !== null && m.restingHr.value >= m.restingHr.avg28 + 5)
    flags.push('resting_hr_elevated');
  if (m.sleepH.value !== null && m.sleepH.value < 6) flags.push('short_sleep');
  if (m.bodyBattery.value !== null && m.bodyBattery.value < 30) flags.push('low_body_battery');

  const readiness = flags.length >= 2 ? 'low' : flags.length === 1 ? 'moderate' : 'good';
  return { date: latest.date, stale: daysBetween(latest.date, today) > 1, metrics, readiness, flags };
}

export function buildBodyweight(rows: BodyWeightRow[], today: string): StatsPack['bodyweight'] {
  const usable = rows
    .filter((r): r is BodyWeightRow & { kg: number } => isNum(r.kg) && r.kg > 0 && r.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = usable[usable.length - 1];
  if (!latest) return null;
  const inRange = (from: number, to: number) =>
    usable.filter(r => {
      const ago = daysBetween(r.date, today);
      return ago >= from && ago <= to;
    }).map(r => r.kg);
  const avg7 = mean(inRange(0, 6));
  const prevAvg7 = mean(inRange(7, 13));
  return {
    latest: latest.kg,
    latestDate: latest.date,
    avg7: avg7 === null ? null : round(avg7),
    prevAvg7: prevAvg7 === null ? null : round(prevAvg7),
    change: avg7 !== null && prevAvg7 !== null ? round(avg7 - prevAvg7) : null,
  };
}

export function buildStatsPack(input: StatsInput): StatsPack {
  const idx = index(input);
  return {
    date: input.today,
    program: buildProgram(input, idx),
    lastSession: buildLastSession(input, idx),
    trends: {
      e1rm: buildE1rm(input, idx),
      weeklySets: buildWeeklySets(input, idx),
      adherence: adherence(input),
    },
    recovery: buildRecovery(input.dailies, input.today),
    bodyweight: buildBodyweight(input.bodyWeights, input.today),
  };
}

/** Compact JSON for the prompt (nulls dropped to save tokens). */
export function statsPackToPrompt(pack: StatsPack): string {
  return JSON.stringify(pack, (_k, v) => (v === null ? undefined : v));
}

export function emptyStatsInput(today: string): StatsInput {
  return {
    today,
    program: null,
    sessions: [],
    sessionExercises: [],
    setLogs: [],
    exercises: [],
    dailies: [],
    bodyWeights: [],
  };
}
