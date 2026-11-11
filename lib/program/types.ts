/**
 * Row types for the v2 tables. Field names match the Postgres columns
 * (supabase/migrations/20261110000000_v2_core.sql) so rows can be sent to
 * Supabase as-is. Timestamps are ISO strings, dates are YYYY-MM-DD.
 */
import type { SessionStatus, UnlockRule } from './unlock';


export type ProgramStatus = 'active' | 'complete' | 'archived';
export type SetSource = 'app' | 'watch';

export interface Program {
  id: string;
  user_id: string;
  name: string;
  template_key: string;
  start_date: string;
  sessions_per_week: number;
  weeks: number;
  status: ProgramStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramSession {
  id: string;
  program_id: string;
  user_id: string;
  seq: number;
  week: number;
  template_key: string;
  title: string;
  phase: string;
  is_deload: boolean;
  cardio_target: string | null;
  status: SessionStatus;
  unlocked_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cardio_done: boolean;
  cardio_duration_s: number | null;
  cardio_avg_hr: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionExercise {
  id: string;
  session_id: string;
  user_id: string;
  /** Current exercise (after any swap). */
  exercise_id: string;
  /** What the template prescribed; differs from exercise_id when swapped. */
  prescribed_exercise_id: string;
  position: number;
  sets: number;
  rep_lo: number;
  rep_hi: number;
  rest_s: number;
  target_kg: number | null;
  created_at: string;
  updated_at: string;
}

export interface SetLog {
  /** Client-generated, deterministic per (session_exercise_id, set_index). */
  id: string;
  session_exercise_id: string;
  session_id: string;
  user_id: string;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  seconds: number | null;
  rpe: number | null;
  done: boolean;
  source: SetSource;
  garmin_activity_id: string | null;
  logged_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BodyWeight {
  user_id: string;
  date: string;
  kg: number;
  source: SetSource;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  /** 0 = Sunday … 6 = Saturday. */
  preferred_days: number[];
  units: 'kg' | 'lb';
  timezone: string;
  unlock_rule: UnlockRule;
  sound_enabled: boolean;
  /** 0..1 */
  sound_volume: number;
  /** Max coach messages per day; null = no cap. Read by /api/coach. */
  coach_daily_cap: number | null;
  created_at: string;
  updated_at: string;
}
