/**
 * Local types for the Garmin track.
 *
 * These deliberately mirror only the fields we need from the foundation
 * tables (program_sessions, session_exercises, set_logs, exercises) so that
 * lib/garmin has no imports from lib/program, lib/local or lib/exercises and
 * the matcher stays a pure function.
 */

/** One active (or rest) set decoded from a strength activity .FIT file. */
export interface WatchSet {
  /** Position of the set in the FIT file (0-based, chronological). */
  index: number;
  setType: 'active' | 'rest';
  /** FIT exercise category as decoded by the SDK, e.g. "benchPress". null if absent/unknown. */
  category: string | null;
  /** FIT category_subtype number, e.g. 1 (barbellBenchPress). null if absent/invalid. */
  subtype: number | null;
  /** Subtype resolved to its FIT profile name, e.g. "barbellBenchPress". */
  subtypeName: string | null;
  reps: number | null;
  /** Kilograms (FIT `weight` field after scale). */
  weightKg: number | null;
  durationS: number | null;
  startTime: string | null;
}

/** A session_exercises row joined with its exercise's Garmin mapping. */
export interface MatchSessionExercise {
  id: string;
  position: number;
  /** Prescribed set count. */
  sets: number;
  /** exercises.is_timed — fill `seconds` instead of `reps`. */
  isTimed: boolean;
  /** exercises.garmin_category, any casing: "BENCH_PRESS" or "benchPress". */
  garminCategory: string | null;
  /** exercises.garmin_subtype: FIT number or name ("BARBELL_BENCH_PRESS" / "barbellBenchPress"). */
  garminSubtype: string | number | null;
}

/** An existing set_logs row for the session. */
export interface MatchSetLog {
  id: string;
  sessionExerciseId: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  seconds: number | null;
  done: boolean;
}

export type MatchRule = 'exact' | 'category' | 'order';

/** A write the matcher wants applied to set_logs. Only empty fields are set. */
export interface SetFill {
  /** Existing set_logs.id to update, or null to insert a new row. */
  setLogId: string | null;
  sessionExerciseId: string;
  setIndex: number;
  /** Only the fields that were empty before; undefined = leave untouched. */
  weightKg?: number | null;
  reps?: number | null;
  seconds?: number | null;
  done: true;
  source: 'watch';
  rule: MatchRule;
  watchSetIndex: number;
}

export type LeftoverReason = 'no_matching_exercise' | 'no_empty_slot' | 'no_session';

export interface LeftoverSet {
  set: WatchSet;
  reason: LeftoverReason;
}

export interface MatchResult {
  fills: SetFill[];
  /** "From watch, needs review" tray. */
  leftovers: LeftoverSet[];
  /** Rest sets that were dropped (informational). */
  ignoredRest: number;
}

/** Activity summary as returned by the Garmin client (normalised). */
export interface GarminActivitySummary {
  activityId: string;
  name: string | null;
  /** Garmin activity type key, e.g. "strength_training", "running". */
  typeKey: string;
  /** ISO 8601 UTC. */
  startTime: string;
  durationS: number | null;
  avgHr: number | null;
  raw: unknown;
}

/** One day of health data (normalised). Every metric optional. */
export interface GarminDaily {
  date: string; // YYYY-MM-DD
  sleepS: number | null;
  restingHr: number | null;
  hrv: number | null;
  bodyBattery: number | null;
  stressAvg: number | null;
  steps: number | null;
  raw?: Record<string, unknown>;
}
