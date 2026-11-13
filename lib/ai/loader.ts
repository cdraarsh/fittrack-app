// ─── AI data loader ───────────────────────────────────────────────────────────
// The ONLY module that knows table/column names. Everything else in lib/ai is
// pure over the row types in ./types. Every query filters by user_id on top of
// RLS. A missing table/column (e.g. Garmin not merged yet) degrades to empty.
//
// Tables read (owned by other tracks): programs, program_sessions,
// session_exercises, set_logs, exercises, garmin_dailies, body_weights,
// user_settings. Tables owned here: daily_insights, coach_messages.

import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, epley1RM } from './stats';
import type { CoachDataSource, ExerciseHistoryEntry, SessionSetsResult } from './tools';
import type { InsightStore } from './insight';
import type {
  BodyWeightRow,
  CoachMessageRow,
  CoachRole,
  DailyInsightRow,
  ExerciseRow,
  GarminDailyRow,
  ProgramRow,
  ProgramSessionRow,
  SessionExerciseRow,
  SetLogRow,
  StatsInput,
  UserSettingsRow,
} from './types';

const COLS = {
  programs: 'id,name,start_date,sessions_per_week,weeks,status',
  sessions: 'id,program_id,seq,week,title,status,completed_at,template_key,is_deload',
  sessionExercises: 'id,session_id,exercise_id,position,sets,rep_lo,rep_hi,target_kg',
  setLogs: 'id,session_exercise_id,set_index,weight_kg,reps,seconds,rpe,done,source,updated_at',
  exercises: 'id,name,pattern,is_timed',
  dailies: 'date,sleep_s,resting_hr,hrv,body_battery,stress_avg,steps',
  bodyWeights: 'date,kg',
} as const;

type Res = { data: unknown; error: { message: string } | null };

async function rows<T>(label: string, q: PromiseLike<Res>): Promise<T[]> {
  const { data, error } = await q;
  if (error) {
    console.warn(`[ai/loader] ${label}: ${error.message}`);
    return [];
  }
  return (Array.isArray(data) ? data : data ? [data] : []) as T[];
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function loadUserSettings(db: SupabaseClient, userId: string): Promise<UserSettingsRow | null> {
  const r = await rows<UserSettingsRow>('user_settings', db.from('user_settings').select('*').eq('user_id', userId).limit(1));
  return r[0] ?? null;
}

// ─── Program ──────────────────────────────────────────────────────────────────

async function activeProgram(db: SupabaseClient, userId: string): Promise<ProgramRow | null> {
  const active = await rows<ProgramRow>(
    'programs',
    db.from('programs').select(COLS.programs).eq('user_id', userId).eq('status', 'active')
      .order('start_date', { ascending: false }).limit(1),
  );
  if (active[0]) return active[0];
  const any = await rows<ProgramRow>(
    'programs',
    db.from('programs').select(COLS.programs).eq('user_id', userId).order('start_date', { ascending: false }).limit(1),
  );
  return any[0] ?? null;
}

async function programSessions(db: SupabaseClient, userId: string, programId: string | null): Promise<ProgramSessionRow[]> {
  let q = db.from('program_sessions').select(COLS.sessions).eq('user_id', userId);
  if (programId) q = q.eq('program_id', programId);
  return rows<ProgramSessionRow>('program_sessions', q.order('seq', { ascending: true }));
}

async function sessionExercisesFor(db: SupabaseClient, userId: string, sessionIds: string[]) {
  if (!sessionIds.length) return [];
  return rows<SessionExerciseRow>(
    'session_exercises',
    db.from('session_exercises').select(COLS.sessionExercises).eq('user_id', userId).in('session_id', sessionIds),
  );
}

async function setLogsFor(db: SupabaseClient, userId: string, seIds: string[]) {
  if (!seIds.length) return [];
  return rows<SetLogRow>('set_logs', db.from('set_logs').select(COLS.setLogs).eq('user_id', userId).in('session_exercise_id', seIds));
}

async function exercisesById(db: SupabaseClient, ids: string[]) {
  if (!ids.length) return [];
  // Exercise library is shared (not user-scoped).
  return rows<ExerciseRow>('exercises', db.from('exercises').select(COLS.exercises).in('id', uniq(ids)));
}

/** Window of history the stats pack needs: last 28 days + a week of slack. */
const HISTORY_DAYS = 35;

const MAIN_LIFT_IDS = ['squat', 'deadlift', 'bench', 'shoulder'];

export async function loadStatsInput(db: SupabaseClient, userId: string, today: string): Promise<StatsInput> {
  const since = addDays(today, -HISTORY_DAYS);
  const program = await activeProgram(db, userId);
  const [sessions, dailies, bodyWeights] = await Promise.all([
    programSessions(db, userId, program?.id ?? null),
    rows<GarminDailyRow>(
      'garmin_dailies',
      db.from('garmin_dailies').select(COLS.dailies).eq('user_id', userId).gte('date', since).lte('date', today),
    ),
    rows<BodyWeightRow>(
      'body_weights',
      db.from('body_weights').select(COLS.bodyWeights).eq('user_id', userId).gte('date', addDays(today, -20)).lte('date', today),
    ),
  ]);

  const done = sessions.filter(s => s.status === 'complete' || !!s.completed_at);
  const lastDone = [...done].sort((a, b) => b.seq - a.seq)[0];
  const next = sessions.filter(s => !(s.status === 'complete' || s.completed_at)).sort((a, b) => a.seq - b.seq)[0];
  const relevant = sessions.filter(
    s => s === lastDone || s === next || (s.completed_at && s.completed_at.slice(0, 10) >= since),
  );
  const sessionExercises = await sessionExercisesFor(db, userId, relevant.map(s => s.id));
  const [setLogs, exercises] = await Promise.all([
    setLogsFor(db, userId, sessionExercises.map(se => se.id)),
    exercisesById(db, sessionExercises.map(se => se.exercise_id)),
  ]);

  // Main lifts by library id (lib/exercises/seed.ts); names are not reliable.
  const mainLiftIds = MAIN_LIFT_IDS.filter(id => exercises.some(e => e.id === id));
  return { today, program, sessions, sessionExercises, setLogs, exercises, dailies, bodyWeights, mainLiftIds };
}

// ─── daily_insights ───────────────────────────────────────────────────────────

export function createInsightStore(db: SupabaseClient): InsightStore {
  return {
    async get(userId, date) {
      const r = await rows<DailyInsightRow>(
        'daily_insights',
        db.from('daily_insights').select('user_id,date,text,stats_pack,model,created_at').eq('user_id', userId).eq('date', date).limit(1),
      );
      return r[0] ?? null;
    },
    async save(row) {
      const { error } = await db.from('daily_insights').upsert(row, { onConflict: 'user_id,date', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    },
  };
}

// ─── coach_messages ───────────────────────────────────────────────────────────

export async function listCoachMessages(
  db: SupabaseClient,
  userId: string,
  opts: { sinceIso?: string; limit?: number } = {},
): Promise<CoachMessageRow[]> {
  let q = db.from('coach_messages').select('id,role,content,tool_calls,created_at').eq('user_id', userId);
  if (opts.sinceIso) q = q.gte('created_at', opts.sinceIso);
  const r = await rows<CoachMessageRow>('coach_messages', q.order('created_at', { ascending: false }).limit(opts.limit ?? 50));
  return r.reverse();
}

export async function insertCoachMessage(
  db: SupabaseClient,
  userId: string,
  msg: { role: CoachRole; content: string; tool_calls?: unknown },
): Promise<void> {
  const { error } = await db.from('coach_messages').insert({
    user_id: userId,
    role: msg.role,
    content: msg.content,
    tool_calls: msg.tool_calls ?? null,
  });
  if (error) throw new Error(error.message);
}

// ─── Coach tool data source ───────────────────────────────────────────────────

const escapeLike = (s: string) => s.replace(/[\\%_]/g, m => `\\${m}`);

export function createCoachDataSource(db: SupabaseClient, today: string): CoachDataSource {
  return {
    async exerciseHistory(userId, { exercise, weeks }) {
      const matches = await rows<ExerciseRow>(
        'exercises',
        db.from('exercises').select(COLS.exercises).ilike('name', `%${escapeLike(exercise.trim())}%`).limit(10),
      );
      const ex = matches.sort((a, b) => a.name.length - b.name.length)[0];
      if (!ex) return { exercise: null, entries: [] };

      const ses = await rows<SessionExerciseRow>(
        'session_exercises',
        db.from('session_exercises').select(COLS.sessionExercises).eq('user_id', userId).eq('exercise_id', ex.id),
      );
      const since = addDays(today, -weeks * 7);
      const sessions = ses.length
        ? await rows<ProgramSessionRow>(
            'program_sessions',
            db.from('program_sessions').select(COLS.sessions).eq('user_id', userId).in('id', uniq(ses.map(s => s.session_id))),
          )
        : [];
      const sessionById = new Map(sessions.map(s => [s.id, s]));
      const sets = (await setLogsFor(db, userId, ses.map(s => s.id))).filter(s => s.done);

      const byEntry = new Map<string, ExerciseHistoryEntry>();
      for (const set of sets) {
        const se = ses.find(x => x.id === set.session_exercise_id)!;
        const session = sessionById.get(se.session_id);
        const date = session?.completed_at?.slice(0, 10) ?? set.updated_at?.slice(0, 10) ?? null;
        if (date && date < since) continue;
        const key = se.session_id;
        const entry = byEntry.get(key) ?? { date, sessionSeq: session?.seq ?? null, sets: [], bestE1rm: null };
        entry.sets.push({ kg: set.weight_kg, reps: set.reps, seconds: set.seconds, rpe: set.rpe });
        const e = epley1RM(set.weight_kg, set.reps);
        if (e !== null && (entry.bestE1rm === null || e > entry.bestE1rm)) entry.bestE1rm = Math.round(e * 10) / 10;
        byEntry.set(key, entry);
      }
      const entries = [...byEntry.values()].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      return { exercise: ex.name, entries };
    },

    async sessionSets(userId, { seq }) {
      const program = await activeProgram(db, userId);
      let q = db.from('program_sessions').select(COLS.sessions).eq('user_id', userId).eq('seq', seq);
      if (program) q = q.eq('program_id', program.id);
      const session = (await rows<ProgramSessionRow>('program_sessions', q.limit(1)))[0];
      if (!session) return null;
      const ses = (await sessionExercisesFor(db, userId, [session.id])).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const [sets, exs] = await Promise.all([
        setLogsFor(db, userId, ses.map(s => s.id)),
        exercisesById(db, ses.map(s => s.exercise_id)),
      ]);
      const result: SessionSetsResult = {
        seq: session.seq,
        title: session.title,
        status: session.status,
        completedAt: session.completed_at,
        exercises: ses.map(se => ({
          name: exs.find(e => e.id === se.exercise_id)?.name ?? 'Unknown',
          prescribed: { sets: se.sets, repLo: se.rep_lo, repHi: se.rep_hi, targetKg: se.target_kg },
          sets: sets
            .filter(s => s.session_exercise_id === se.id)
            .sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0))
            .map(s => ({ index: s.set_index, kg: s.weight_kg, reps: s.reps, seconds: s.seconds, done: !!s.done, source: s.source })),
        })),
      };
      return result;
    },

    async garminDailies(userId, { from, to }) {
      return rows<GarminDailyRow>(
        'garmin_dailies',
        db.from('garmin_dailies').select(COLS.dailies).eq('user_id', userId).gte('date', from).lte('date', to)
          .order('date', { ascending: true }),
      );
    },

    async bodyweightTrend(userId, { days }) {
      return rows<BodyWeightRow>(
        'body_weights',
        db.from('body_weights').select(COLS.bodyWeights).eq('user_id', userId).gte('date', addDays(today, -days))
          .lte('date', today).order('date', { ascending: true }),
      );
    },
  };
}
