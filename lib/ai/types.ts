// ─── AI track: minimal input row types ───────────────────────────────────────
// These mirror the columns the loader (lib/ai/loader.ts) selects from tables
// owned by the foundation and Garmin tracks. Only the fields the AI code reads
// are listed; everything is nullable-tolerant so partial data never crashes the
// stats pack. Dates are 'YYYY-MM-DD' strings; timestamps are ISO strings.

export interface ProgramRow {
  id: string;
  name: string | null;
  start_date: string | null;        // YYYY-MM-DD
  sessions_per_week: number | null;
  weeks: number | null;
  status: string | null;            // 'active' | ...
}

export interface ProgramSessionRow {
  id: string;
  program_id?: string | null;
  seq: number;                      // 1-based session number in the program
  week: number | null;
  title: string | null;
  status: string | null;            // 'locked' | 'unlocked' | 'completed' (foundation-defined)
  completed_at: string | null;      // ISO timestamp
}

export interface SessionExerciseRow {
  id: string;
  session_id: string;
  exercise_id: string;
  position: number | null;
  sets: number | null;              // prescribed sets
  rep_lo: number | null;
  rep_hi: number | null;
  target_kg: number | null;
}

export interface SetLogRow {
  id: string;
  session_exercise_id: string;
  set_index: number | null;
  weight_kg: number | null;
  reps: number | null;
  seconds: number | null;
  rpe: number | null;
  done: boolean | null;
  source: string | null;            // 'app' | 'watch'
  updated_at: string | null;        // ISO timestamp
}

export interface ExerciseRow {
  id: string;
  name: string;
  pattern: string | null;           // movement pattern / muscle group bucket
  is_timed?: boolean | null;
}

export interface GarminDailyRow {
  date: string;                     // YYYY-MM-DD
  sleep_s: number | null;
  resting_hr: number | null;
  hrv: number | null;
  body_battery: number | null;
  stress_avg: number | null;
  steps: number | null;
}

export interface BodyWeightRow {
  date: string;                     // YYYY-MM-DD
  kg: number | null;
}

/** user_settings is read with select('*'); only these optional fields are used. */
export interface UserSettingsRow {
  timezone?: string | null;
  coach_daily_cap?: number | null;  // optional column; falls back to DEFAULT_COACH_DAILY_CAP
}

/** Everything the stats pack needs, as plain data. */
export interface StatsInput {
  today: string;                    // YYYY-MM-DD in the user's timezone
  program: ProgramRow | null;
  sessions: ProgramSessionRow[];
  sessionExercises: SessionExerciseRow[];
  setLogs: SetLogRow[];
  exercises: ExerciseRow[];
  dailies: GarminDailyRow[];
  bodyWeights: BodyWeightRow[];
  /** Optional explicit main-lift exercise ids; otherwise detected by name. */
  mainLiftIds?: string[];
}

export interface DailyInsightRow {
  user_id: string;
  date: string;
  text: string;
  stats_pack: unknown;
  model: string;
  created_at?: string;
}

export type CoachRole = 'user' | 'assistant';

export interface CoachMessageRow {
  id?: string;
  user_id?: string;
  role: CoachRole;
  content: string;
  tool_calls?: unknown;
  created_at: string;
}
