/**
 * Warm-up and cool-down routines per strength day.
 *
 * Pure data + helpers. These items are guidance only: they are never logged to
 * Supabase, never count toward completing a session and never touch the locked
 * progression (`unlock.ts`, the SQL). Optional ticks live in localStorage
 * (components/workout/RoutineCard.tsx).
 */
import { roundToPlate } from './templates';

export type RoutineKind = 'warmup' | 'cooldown';

export interface RoutineItem {
  /** Stable id; also the key in lib/exercises/videos.ts. */
  id: string;
  name: string;
  /** Human dose, e.g. "10 reps", "30 s / side". */
  dose: string;
  /** One-line coaching cue. */
  cue: string;
  /** Rough time for the whole item, in seconds (drives "~N min"). */
  est_s: number;
}

export interface DayRoutines {
  warmup: string[];
  cooldown: string[];
}

const item = (id: string, name: string, dose: string, cue: string, est_s: number): RoutineItem => ({ id, name, dose, cue, est_s });

/** Every warm-up / cool-down item, by id. Routines reference these. */
export const ROUTINE_ITEMS: Record<string, RoutineItem> = Object.fromEntries(
  [
    // General raise
    item('wu-row-easy', 'Easy row', '3 min', 'Conversational pace; legs, then body, then arms.', 180),
    item('wu-bike-easy', 'Easy bike', '3 min', 'Light resistance, nose-breathing pace.', 180),
    // Upper-body prep
    item('wu-band-pull-apart', 'Band pull-apart', '15 reps', 'Arms straight, squeeze the shoulder blades, ribs down.', 45),
    item('wu-band-dislocate', 'Band shoulder pass-through', '10 reps', 'Wide grip, slow, no pain; keep ribs down.', 45),
    item('wu-scap-pushup', 'Scap push-up', '10 reps', 'Elbows locked; only the shoulder blades move.', 45),
    item('wu-band-external-rotation', 'Band external rotation', '12 reps / side', 'Elbow pinned to your side; rotate out slowly.', 60),
    item('wu-dead-hang', 'Dead hang', '2 × 20 s', 'Relaxed grip-and-hang; shoulders can rise to the ears.', 60),
    item('wu-cat-cow', 'Cat-cow', '8 reps', 'Move one vertebra at a time, breathe with it.', 45),
    item('wu-open-book', 'Open book', '8 reps / side', 'Knees stacked and pinned; rotate from the upper back.', 75),
    // Lower-body prep
    item('wu-leg-swings', 'Leg swings', '10 / side, front-back + side-side', 'Hold a rack, stay tall, grow the range gradually.', 60),
    item('wu-worlds-greatest-stretch', "World's greatest stretch", '4 / side', 'Lunge, elbow to instep, then rotate the arm to the ceiling.', 60),
    item('wu-ankle-rock', 'Knee-to-wall ankle rocks', '10 / side', 'Heel stays down; knee tracks over the middle toes.', 60),
    item('wu-goblet-squat-pry', 'Goblet squat pry', '5 reps, 3 s hold', 'Sit deep, elbows push knees out, chest tall.', 60),
    item('wu-glute-bridge', 'Glute bridge', '12 reps', 'Drive through heels, squeeze glutes 1 s at the top.', 45),
    item('wu-hip-hinge-dowel', 'Dowel hip hinge', '10 reps', 'Head, upper back and tailbone stay on the dowel.', 45),
    item('wu-bird-dog', 'Bird dog', '6 / side, 2 s hold', 'Reach long, hips square, no arching.', 60),
    // Cool-down stretches
    item('cd-doorway-pec-stretch', 'Doorway pec stretch', '30 s / side', 'Elbow at shoulder height; step through gently.', 60),
    item('cd-cross-body-shoulder', 'Cross-body shoulder stretch', '30 s / side', 'Pull the arm across, shoulder down away from the ear.', 60),
    item('cd-overhead-triceps', 'Overhead triceps stretch', '30 s / side', 'Elbow up, hand down the back; easy pressure.', 60),
    item('cd-biceps-wall-stretch', 'Biceps wall stretch', '30 s / side', 'Palm on the wall behind you, turn the body away.', 60),
    item('cd-thread-the-needle', 'Thread the needle', '30 s / side', 'Slide the arm under, let the upper back rotate.', 60),
    item('cd-childs-pose', "Child's pose lat stretch", '45 s', 'Hips back, arms long; breathe into the sides.', 45),
    item('cd-hip-flexor-stretch', 'Half-kneeling hip flexor stretch', '45 s / side', 'Tuck the pelvis, squeeze the back glute, shift forward.', 90),
    item('cd-standing-quad', 'Standing quad stretch', '30 s / side', 'Knees together, hips forward; hold a support.', 60),
    item('cd-figure-four', 'Figure-four stretch', '45 s / side', 'Lying down, ankle over knee, pull the leg in.', 90),
    item('cd-calf-stretch', 'Wall calf stretch', '30 s / side', 'Back heel down, knee straight then slightly bent.', 60),
    item('cd-hamstring-stretch', 'Strap hamstring stretch', '45 s / side', 'Lying down, knee straight, raise until a mild stretch.', 90),
  ].map((i) => [i.id, i]),
);

/** Day template key → warm-up drills (after the raise) and cool-down stretches. */
export const DAY_ROUTINES: Record<string, DayRoutines> = {
  // Upper A — push (bench first)
  upper_a: {
    warmup: ['wu-row-easy', 'wu-band-pull-apart', 'wu-band-dislocate', 'wu-scap-pushup', 'wu-band-external-rotation'],
    cooldown: ['cd-doorway-pec-stretch', 'cd-cross-body-shoulder', 'cd-overhead-triceps', 'cd-childs-pose'],
  },
  // Lower A — quads (squat first)
  lower_a: {
    warmup: ['wu-bike-easy', 'wu-leg-swings', 'wu-worlds-greatest-stretch', 'wu-ankle-rock', 'wu-goblet-squat-pry'],
    cooldown: ['cd-hip-flexor-stretch', 'cd-standing-quad', 'cd-figure-four', 'cd-calf-stretch'],
  },
  // Upper B — pull (bent-over row first)
  upper_b: {
    warmup: ['wu-row-easy', 'wu-cat-cow', 'wu-open-book', 'wu-band-pull-apart', 'wu-dead-hang'],
    cooldown: ['cd-childs-pose', 'cd-doorway-pec-stretch', 'cd-biceps-wall-stretch', 'cd-thread-the-needle'],
  },
  // Lower B — hinge (deadlift first)
  lower_b: {
    warmup: ['wu-bike-easy', 'wu-cat-cow', 'wu-glute-bridge', 'wu-hip-hinge-dowel', 'wu-bird-dog'],
    cooldown: ['cd-hamstring-stretch', 'cd-figure-four', 'cd-hip-flexor-stretch', 'cd-childs-pose'],
  },
};

export function routineItems(templateKey: string, kind: RoutineKind): RoutineItem[] {
  const ids = DAY_ROUTINES[templateKey]?.[kind] ?? [];
  return ids.map((id) => ROUTINE_ITEMS[id]).filter((i): i is RoutineItem => !!i);
}

// ── Ramp-up sets ────────────────────────────────────────────────────────────

export interface RampSet {
  /** null = no working weight yet: "empty bar" / "light". */
  kg: number | null;
  reps: number;
  /** Fraction of the working weight, when there is one. */
  pct: number | null;
  /** True when this set is just the bar. */
  emptyBar: boolean;
}

/** Roughly 50 % × 8, 70 % × 5, 85 % × 3 of the first working weight. */
export const RAMP_STEPS: ReadonlyArray<{ pct: number; reps: number }> = [
  { pct: 0.5, reps: 8 },
  { pct: 0.7, reps: 5 },
  { pct: 0.85, reps: 3 },
];

/** Equipment that has a bar (20 kg Olympic bar assumed). */
export const BAR_EQUIPMENT = new Set(['barbell', 'smith', 'trap_bar']);
export const BAR_KG = 20;

/**
 * The weight the set grid prefills for a lift: last done weight (deload ~60 %),
 * else the session's target. Shared with ExerciseBlock so the ramp matches.
 */
export function prefillWeight(lastWeight: number | null, isDeload: boolean, targetKg: number | null): number | null {
  return lastWeight !== null ? (isDeload ? roundToPlate(lastWeight * 0.6) : lastWeight) : targetKg;
}

/** Seconds per ramp set incl. plate change (drives "~N min"). */
export const RAMP_SET_S = 45;

/**
 * Ramp-up sets for the day's first main lift, from its prefilled working
 * weight. Barbell lifts start with the empty bar; loads round to the plate,
 * never drop below the bar, never repeat and stay under the working weight.
 */
export function rampUpSets(workingKg: number | null | undefined, opts: { barKg?: number } = {}): RampSet[] {
  const bar = opts.barKg ?? 0;
  if (workingKg === null || workingKg === undefined || !Number.isFinite(workingKg) || workingKg <= 0) {
    return [{ kg: bar > 0 ? bar : null, reps: 10, pct: null, emptyBar: bar > 0 }];
  }
  const out: RampSet[] = [];
  if (bar > 0) out.push({ kg: bar, reps: 10, pct: null, emptyBar: true });
  for (const step of RAMP_STEPS) {
    const kg = Math.max(bar, roundToPlate(workingKg * step.pct));
    if (kg <= 0 || kg >= workingKg) continue;
    const prev = out[out.length - 1];
    if (prev && prev.kg !== null && kg <= prev.kg) continue;
    out.push({ kg, reps: step.reps, pct: step.pct, emptyBar: bar > 0 && kg === bar });
  }
  return out;
}

/** "~N min" for a routine (rounded, at least 1). */
export function routineMinutes(items: RoutineItem[], extraSeconds = 0): number {
  const s = items.reduce((n, i) => n + i.est_s, 0) + extraSeconds;
  return Math.max(1, Math.round(s / 60));
}

// ── Default open/closed ─────────────────────────────────────────────────────

export interface RoutineOpenInput {
  /** Preview of a future/locked session: both cards collapsed and read-only. */
  readOnly: boolean;
  status: 'locked' | 'up_next' | 'in_progress' | 'complete';
  /** Any working set ticked done. */
  anyWorkingDone: boolean;
  /** Every prescribed working set done. */
  allWorkingDone: boolean;
}

/**
 * Default expansion before the user toggles a card (their toggle wins, per session).
 * Warm-up: open while up next, or in progress before the first working tick.
 * Cool-down: open once every working set of a running session is done.
 * Completed sessions (History) show both collapsed.
 */
export function defaultRoutineOpen(kind: RoutineKind, s: RoutineOpenInput): boolean {
  if (s.readOnly || s.status === 'locked' || s.status === 'complete') return false;
  if (kind === 'warmup') return s.status === 'up_next' || (s.status === 'in_progress' && !s.anyWorkingDone);
  return s.status === 'in_progress' && s.allWorkingDone;
}
