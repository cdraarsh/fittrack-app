/**
 * Local-first domain writes. Each one updates Dexie first, runs the shared
 * unlock state machine locally, and queues the matching Supabase write in the
 * outbox. The server re-checks everything (triggers + complete_session()).
 */
import { EXERCISES } from '@/lib/exercises/seed';
import { advance, allWorkingSetsDone, DEFAULT_TEMPLATE, generateProgram, localDate, setLogId, type ProgramTemplate, type ProgressionResult } from '@/lib/program';
import type { BodyWeight, ProgramSession, SessionExercise, SetLog, UserSettings } from '@/lib/program/types';
import { getMeta, setMeta, type FitDB } from './db';
import { enqueue } from './outbox';
import { pauseKey } from './pause';

export class LocalRuleError extends Error {
  constructor(public code: 'locked' | 'incomplete' | 'not_found' | 'session_complete' | 'cannot_untick' | 'active_program_exists' | 'swap_not_allowed' | 'not_started') {
    super(code);
    this.name = 'LocalRuleError';
  }
}

const iso = (d?: Date) => (d ?? new Date()).toISOString();
const deviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

// ─── Exercise library ─────────────────────────────────────────────────────────

const LIBRARY_VERSION = EXERCISES.length + ':' + EXERCISES.map((e) => e.id).join(',').length;

/** The library ships with the app bundle, so it's available offline from first launch. */
export async function seedExercises(db: FitDB): Promise<void> {
  if ((await getMeta<string>(db, 'exercises_version')) === LIBRARY_VERSION) return;
  await db.exercises.bulkPut(EXERCISES);
  await setMeta(db, 'exercises_version', LIBRARY_VERSION);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function defaultSettings(userId: string, now = new Date()): UserSettings {
  return {
    user_id: userId,
    preferred_days: [1, 2, 4, 5],
    units: 'kg',
    timezone: deviceTimeZone(),
    unlock_rule: 'next_calendar_day',
    sound_enabled: true,
    sound_volume: 0.8,
    coach_daily_cap: 20,
    created_at: iso(now),
    updated_at: iso(now),
  };
}

export async function ensureSettings(db: FitDB, userId: string): Promise<UserSettings> {
  const existing = await db.user_settings.get(userId);
  if (existing) return existing;
  const s = defaultSettings(userId);
  await db.user_settings.put(s);
  await enqueue(db, { kind: 'upsert', table: 'user_settings', rows: [{ ...s }], onConflict: 'user_id' }, `user_settings:${userId}`);
  return s;
}

export async function updateSettings(
  db: FitDB,
  userId: string,
  patch: Partial<Omit<UserSettings, 'user_id' | 'created_at' | 'updated_at'>>,
  now = new Date(),
): Promise<UserSettings> {
  const cur = (await db.user_settings.get(userId)) ?? defaultSettings(userId, now);
  const next: UserSettings = { ...cur, ...patch, updated_at: iso(now) };
  await db.user_settings.put(next);
  await enqueue(db, { kind: 'upsert', table: 'user_settings', rows: [{ ...next }], onConflict: 'user_id' }, `user_settings:${userId}`);
  // A rule or time-zone change can unlock the next session right away.
  await refreshProgress(db, userId, now);
  return next;
}

// ─── Program ──────────────────────────────────────────────────────────────────

export async function getActiveProgram(db: FitDB, userId: string) {
  return db.programs.where('user_id').equals(userId).filter((p) => p.status === 'active').first();
}

/** Generate a numbered program locally and queue it for the server. */
export async function startProgram(
  db: FitDB,
  userId: string,
  opts: { template?: ProgramTemplate; now?: Date; programId?: string } = {},
): Promise<string> {
  if (await getActiveProgram(db, userId)) throw new LocalRuleError('active_program_exists');
  const now = opts.now ?? new Date();
  const settings = await ensureSettings(db, userId);
  const g = generateProgram({
    template: opts.template ?? DEFAULT_TEMPLATE,
    programId: opts.programId ?? globalThis.crypto.randomUUID(),
    userId,
    startDate: localDate(now, settings.timezone),
    now: iso(now),
  });
  await db.transaction('rw', [db.programs, db.program_sessions, db.session_exercises], async () => {
    await db.programs.put(g.program);
    await db.program_sessions.bulkPut(g.sessions);
    await db.session_exercises.bulkPut(g.sessionExercises);
  });
  const ins = { onConflict: 'id', ignoreDuplicates: true } as const;
  await enqueue(db, { kind: 'upsert', table: 'programs', rows: [{ ...g.program }], ...ins });
  await enqueue(db, { kind: 'upsert', table: 'program_sessions', rows: g.sessions.map((s) => ({ ...s })), ...ins });
  for (let i = 0; i < g.sessionExercises.length; i += 200) {
    await enqueue(db, { kind: 'upsert', table: 'session_exercises', rows: g.sessionExercises.slice(i, i + 200).map((s) => ({ ...s })), ...ins });
  }
  return g.program.id;
}

async function progressionContext(db: FitDB, userId: string, now: Date) {
  const s = (await db.user_settings.get(userId)) ?? defaultSettings(userId, now);
  return { rule: s.unlock_rule, timeZone: s.timezone, now };
}

/** Write the state-machine result back (local only — the server decides on its own and confirms on sync). */
async function applyProgression(db: FitDB, programId: string, r: ProgressionResult<ProgramSession>) {
  const byId = new Map(r.sessions.map((s) => [s.id, s]));
  await db.transaction('rw', [db.program_sessions, db.programs], async () => {
    for (const id of r.changed) await db.program_sessions.put(byId.get(id)!);
    if (r.programComplete) {
      const p = await db.programs.get(programId);
      if (p && p.status === 'active') {
        const last = r.sessions[r.sessions.length - 1];
        await db.programs.put({ ...p, status: 'complete', completed_at: last?.completed_at ?? iso() });
      }
    }
  });
}

/** Re-evaluate unlocks (app open, visibility change, day rollover, after sync). */
export async function refreshProgress(db: FitDB, userId: string, now = new Date()): Promise<ProgressionResult<ProgramSession> | null> {
  const program = await getActiveProgram(db, userId);
  if (!program) return null;
  const sessions = await db.program_sessions.where('program_id').equals(program.id).toArray();
  const r = advance(sessions, { type: 'refresh' }, await progressionContext(db, userId, now));
  if (r.changed.length || r.programComplete) await applyProgression(db, program.id, r);
  return r;
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export type SetPatch = Partial<Pick<SetLog, 'weight_kg' | 'reps' | 'seconds' | 'rpe' | 'done'>>;

/**
 * Save one set (on tick or blur — never per keystroke). Refused for locked
 * sessions; on a complete session only done rows can be edited and never unticked.
 */
// Set writes run one at a time: each is a read-modify-write of the same row
// (and may advance the session), so two quick saves — blur on reps then tick,
// or weight then reps — must not both start from the old row and drop a field.
// Start / Reset / Complete share the queue, so a save can't straddle a reset.
let setWriteQueue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = setWriteQueue.then(fn);
  setWriteQueue = run.catch(() => undefined);
  return run;
}

export function saveSet(
  db: FitDB,
  userId: string,
  args: { sessionExerciseId: string; setIndex: number; patch: SetPatch },
  now?: Date,
): Promise<SetLog> {
  return serial(() => saveSetNow(db, userId, args, now ?? new Date()));
}

async function saveSetNow(
  db: FitDB,
  userId: string,
  args: { sessionExerciseId: string; setIndex: number; patch: SetPatch },
  now: Date,
): Promise<SetLog> {
  const se = await db.session_exercises.get(args.sessionExerciseId);
  if (!se) throw new LocalRuleError('not_found');
  const session = await db.program_sessions.get(se.session_id);
  if (!session) throw new LocalRuleError('not_found');

  const existing = await db.set_logs.where('[session_exercise_id+set_index]').equals([se.id, args.setIndex]).first();

  // A session only starts from the Start button, never by typing into a set.
  if (session.status === 'up_next') throw new LocalRuleError('not_started');

  if (session.status === 'complete') {
    if (!existing?.done) throw new LocalRuleError('session_complete');
    if (args.patch.done === false) throw new LocalRuleError('cannot_untick');
  }

  // State machine first: refuses locked sessions, moves up_next → in_progress.
  const sessions = await db.program_sessions.where('program_id').equals(session.program_id).toArray();
  const r = advance(sessions, { type: 'log_set', sessionId: session.id }, await progressionContext(db, userId, now));
  if (!r.ok) throw new LocalRuleError(r.error === 'locked' ? 'locked' : 'not_found');

  const base: SetLog = existing ?? {
    id: setLogId(se.id, args.setIndex),
    session_exercise_id: se.id,
    session_id: se.session_id,
    user_id: userId,
    set_index: args.setIndex,
    weight_kg: null,
    reps: null,
    seconds: null,
    rpe: null,
    done: false,
    source: 'app',
    garmin_activity_id: null,
    logged_at: null,
    created_at: iso(now),
    updated_at: iso(now),
  };
  const row: SetLog = {
    ...base,
    ...args.patch,
    source: 'app',
    logged_at: args.patch.done && !base.done ? iso(now) : base.logged_at,
    updated_at: iso(now),
  };

  await enqueue(db, { kind: 'upsert', table: 'set_logs', rows: [{ ...row }], onConflict: 'id' }, `set_logs:${row.id}`);
  await db.set_logs.put(row);
  if (r.changed.length) await applyProgression(db, session.program_id, r);
  return row;
}

/** Swap to another exercise in the same swap group (current session only). */
export async function swapExercise(db: FitDB, sessionExerciseId: string, exerciseId: string, now = new Date()): Promise<void> {
  const se = await db.session_exercises.get(sessionExerciseId);
  if (!se) throw new LocalRuleError('not_found');
  const session = await db.program_sessions.get(se.session_id);
  if (!session || (session.status !== 'up_next' && session.status !== 'in_progress')) throw new LocalRuleError('swap_not_allowed');
  const [target, prescribed] = await Promise.all([db.exercises.get(exerciseId), db.exercises.get(se.prescribed_exercise_id)]);
  if (!target || !prescribed || target.swap_group !== prescribed.swap_group) throw new LocalRuleError('swap_not_allowed');
  const updated_at = iso(now);
  await enqueue(db, { kind: 'update', table: 'session_exercises', id: se.id, patch: { exercise_id: exerciseId, updated_at } }, `swap:${se.id}`);
  await db.session_exercises.put({ ...se, exercise_id: exerciseId, updated_at });
}

export type SessionPatch = Partial<Pick<ProgramSession, 'notes' | 'cardio_done' | 'cardio_duration_s' | 'cardio_avg_hr'>>;

export async function updateSessionFields(db: FitDB, sessionId: string, patch: SessionPatch, now = new Date()): Promise<void> {
  const s = await db.program_sessions.get(sessionId);
  if (!s) throw new LocalRuleError('not_found');
  if (s.status === 'locked') throw new LocalRuleError('locked');
  const updated_at = iso(now);
  // Coalesce per session; the merged patch carries every field changed so far.
  const key = `session:${sessionId}`;
  const prev = await db.outbox.where('key').equals(key).filter((o) => o.status === 'pending').last();
  const prevPatch = prev?.payload.kind === 'update' ? prev.payload.patch : {};
  await enqueue(db, { kind: 'update', table: 'program_sessions', id: sessionId, patch: { ...prevPatch, ...patch, updated_at } }, key);
  await db.program_sessions.put({ ...s, ...patch, updated_at });
}

/**
 * Complete a session: every prescribed working set must be done. Unlocks the
 * next session locally per the rule; the server re-validates in complete_session().
 */
export function completeSession(db: FitDB, userId: string, sessionId: string, now = new Date()): Promise<ProgressionResult<ProgramSession>> {
  return serial(() => completeSessionNow(db, userId, sessionId, now));
}

async function completeSessionNow(db: FitDB, userId: string, sessionId: string, now: Date): Promise<ProgressionResult<ProgramSession>> {
  const session = await db.program_sessions.get(sessionId);
  if (!session) throw new LocalRuleError('not_found');
  const [ses, logs] = await Promise.all([
    db.session_exercises.where('session_id').equals(sessionId).toArray(),
    db.set_logs.where('session_id').equals(sessionId).toArray(),
  ]);
  const sessions = await db.program_sessions.where('program_id').equals(session.program_id).toArray();
  const wasComplete = session.status === 'complete';
  const r = advance(
    sessions,
    { type: 'complete', sessionId, allWorkingSetsDone: allWorkingSetsDone(ses, logs) },
    await progressionContext(db, userId, now),
  );
  if (!r.ok) throw new LocalRuleError(r.error === 'incomplete' ? 'incomplete' : r.error === 'locked' ? 'locked' : 'not_found');
  if (!wasComplete) {
    await enqueue(db, { kind: 'rpc', fn: 'complete_session', args: { session_id: sessionId, client_completed_at: iso(now) } });
  }
  await db.meta.delete(pauseKey(sessionId));
  await applyProgression(db, session.program_id, r);
  return r;
}

/** Start button: up_next → in_progress (records started_at for the workout timer). */
export function startSession(db: FitDB, userId: string, sessionId: string, now = new Date()): Promise<ProgressionResult<ProgramSession>> {
  return serial(() => startSessionNow(db, userId, sessionId, now));
}

async function startSessionNow(db: FitDB, userId: string, sessionId: string, now: Date): Promise<ProgressionResult<ProgramSession>> {
  const session = await db.program_sessions.get(sessionId);
  if (!session) throw new LocalRuleError('not_found');
  const sessions = await db.program_sessions.where('program_id').equals(session.program_id).toArray();
  const r = advance(sessions, { type: 'start', sessionId }, await progressionContext(db, userId, now));
  if (!r.ok) throw new LocalRuleError(r.error === 'locked' ? 'locked' : 'not_found');
  if (session.status === 'up_next') {
    await enqueue(db, { kind: 'rpc', fn: 'start_session', args: { session_id: sessionId, client_started_at: iso(now) } });
    await db.meta.delete(pauseKey(sessionId)); // a fresh start is never paused
    await applyProgression(db, session.program_id, r);
  }
  return r;
}

/**
 * Undo an accidental start: in_progress → up_next and discard this session's
 * logged sets (locally, any of their unsent writes, and on the server). A
 * completed session can't be reset.
 */
export function resetSession(db: FitDB, userId: string, sessionId: string, now = new Date()): Promise<ProgressionResult<ProgramSession>> {
  return serial(() => resetSessionNow(db, userId, sessionId, now));
}

async function resetSessionNow(db: FitDB, userId: string, sessionId: string, now: Date): Promise<ProgressionResult<ProgramSession>> {
  const session = await db.program_sessions.get(sessionId);
  if (!session) throw new LocalRuleError('not_found');
  const sessions = await db.program_sessions.where('program_id').equals(session.program_id).toArray();
  const r = advance(sessions, { type: 'reset', sessionId }, await progressionContext(db, userId, now));
  if (!r.ok) throw new LocalRuleError(r.error === 'already_complete' ? 'session_complete' : r.error === 'locked' ? 'locked' : 'not_found');
  if (session.status !== 'in_progress') return r;

  await enqueue(db, { kind: 'rpc', fn: 'reset_session', args: { session_id: sessionId } });
  await db.meta.delete(pauseKey(sessionId));
  await db.transaction('rw', [db.set_logs, db.outbox, db.program_sessions, db.programs], async () => {
    const logs = await db.set_logs.where('session_id').equals(sessionId).toArray();
    const keys = new Set(logs.map((l) => `set_logs:${l.id}`));
    await db.outbox.filter((o) => (o.status === 'pending' || o.status === 'failed') && !!o.key && keys.has(o.key)).delete();
    await db.set_logs.bulkDelete(logs.map((l) => l.id));
    await applyProgression(db, session.program_id, r);
  });
  return r;
}

// ─── Body weight ──────────────────────────────────────────────────────────────

export async function saveBodyWeight(db: FitDB, userId: string, date: string, kg: number, now = new Date()): Promise<BodyWeight> {
  const cur = await db.body_weights.get([userId, date]);
  const row: BodyWeight = { user_id: userId, date, kg, source: 'app', created_at: cur?.created_at ?? iso(now), updated_at: iso(now) };
  await db.body_weights.put(row);
  await enqueue(db, { kind: 'upsert', table: 'body_weights', rows: [{ ...row }], onConflict: 'user_id,date' }, `body_weights:${date}`);
  return row;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Most recent done weight for an exercise, outside the given session (for
 * prefill). Deload sessions are skipped: their ~60% loads must not become the
 * next week's working weight (and a deload prefills 60% of the real weight).
 */
export async function lastWeightFor(db: FitDB, exerciseId: string, excludeSessionId?: string): Promise<number | null> {
  const ses: SessionExercise[] = await db.session_exercises.where('exercise_id').equals(exerciseId).toArray();
  const deload = new Set(
    (await db.program_sessions.bulkGet([...new Set(ses.map((s) => s.session_id))])).filter((s) => s?.is_deload).map((s) => s!.id),
  );
  let best: SetLog | null = null;
  for (const se of ses) {
    if (se.session_id === excludeSessionId || deload.has(se.session_id)) continue;
    const logs = await db.set_logs.where('session_exercise_id').equals(se.id).toArray();
    for (const l of logs) {
      if (!l.done || l.weight_kg === null) continue;
      const t = l.logged_at ?? l.updated_at;
      if (!best || t > (best.logged_at ?? best.updated_at)) best = l;
    }
  }
  return best?.weight_kg ?? null;
}
