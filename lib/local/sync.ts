import type { SupabaseClient } from '@supabase/supabase-js';
import type { BodyWeight, Program, ProgramSession, SessionExercise, SetLog, UserSettings } from '@/lib/program/types';
import { refreshProgress } from './actions';
import { getMeta, setMeta, type FitDB } from './db';
import { mergeSetLog } from './merge';
import { flush, pendingCount, type FlushResult } from './outbox';

const PAGE = 1000;
/** Re-read a day of set_logs before the cursor: updated_at comes from client clocks. */
const CURSOR_OVERLAP_MS = 24 * 60 * 60 * 1000;

type Query = { range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

async function fetchAll<T>(make: () => Query): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

/**
 * Pull server state into Dexie. Only call with an empty outbox (no pending
 * ops): server rows are then authoritative for programs/sessions/exercises,
 * and set_logs / settings / body weights merge last-write-wins.
 */
export async function pull(db: FitDB, client: SupabaseClient, userId: string): Promise<void> {
  // Let the server apply calendar unlocks first so we read confirmed states.
  await client.rpc('refresh_unlocks');

  const settings = await client.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
  if (settings.error) throw new Error(settings.error.message);
  if (settings.data) {
    const remote = settings.data as UserSettings;
    const local = await db.user_settings.get(userId);
    if (!local || ms(remote.updated_at) >= ms(local.updated_at)) await db.user_settings.put({ ...local, ...remote });
  }

  const programs = await fetchAll<Program>(() => client.from('programs').select('*').eq('user_id', userId).order('created_at'));
  const sessions = await fetchAll<ProgramSession>(() => client.from('program_sessions').select('*').eq('user_id', userId).order('id'));
  const ses = await fetchAll<SessionExercise>(() => client.from('session_exercises').select('*').eq('user_id', userId).order('id'));
  await db.transaction('rw', [db.programs, db.program_sessions, db.session_exercises], async () => {
    await db.programs.bulkPut(programs);
    await db.program_sessions.bulkPut(sessions);
    await db.session_exercises.bulkPut(ses);
  });

  const cursor = (await getMeta<string>(db, 'pull:set_logs')) ?? null;
  const since = cursor ? new Date(ms(cursor) - CURSOR_OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z';
  const logs = await fetchAll<SetLog>(() =>
    client.from('set_logs').select('*').eq('user_id', userId).gt('updated_at', since).order('updated_at').order('id'),
  );
  let maxSeen = cursor;
  await db.transaction('rw', db.set_logs, async () => {
    for (const remote of logs) {
      const local =
        (await db.set_logs.get(remote.id)) ??
        (await db.set_logs.where('[session_exercise_id+set_index]').equals([remote.session_exercise_id, remote.set_index]).first());
      const merged = mergeSetLog(local, normaliseSetLog(remote))!;
      if (local && local.id !== merged.id) await db.set_logs.delete(local.id);
      await db.set_logs.put(merged);
      if (!maxSeen || ms(remote.updated_at) > ms(maxSeen)) maxSeen = remote.updated_at;
    }
  });
  if (maxSeen) await setMeta(db, 'pull:set_logs', maxSeen);

  const weights = await fetchAll<BodyWeight>(() => client.from('body_weights').select('*').eq('user_id', userId).order('date'));
  await db.transaction('rw', db.body_weights, async () => {
    for (const remote of weights) {
      const local = await db.body_weights.get([userId, remote.date]);
      if (!local || ms(remote.updated_at) >= ms(local.updated_at)) await db.body_weights.put({ ...remote, kg: Number(remote.kg) });
    }
  });
}

function normaliseSetLog(r: SetLog): SetLog {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    ...r,
    weight_kg: num(r.weight_kg),
    rpe: num(r.rpe),
    garmin_activity_id: r.garmin_activity_id === null || r.garmin_activity_id === undefined ? null : String(r.garmin_activity_id),
  };
}

export interface SyncResult extends FlushResult {
  pulled: boolean;
}

/** Flush the outbox, then (if nothing is left pending) pull and re-run local unlocks. */
export async function syncNow(db: FitDB, client: SupabaseClient, userId: string): Promise<SyncResult> {
  const f = await flush(db, client);
  let pulled = false;
  if (!f.blocked && (await pendingCount(db)) === 0) {
    await pull(db, client, userId);
    pulled = true;
    await setMeta(db, 'last_synced_at', new Date().toISOString());
  }
  await refreshProgress(db, userId);
  return { ...f, pulled };
}
