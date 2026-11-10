/**
 * Server-only Supabase access for Garmin (service role; bypasses RLS).
 * Never import from client components. Does not touch lib/supabase.ts.
 *
 * Assumes the foundation schema (20261110000000_v2_core.sql):
 *   program_sessions(id uuid, user_id text, seq int, status text, completed_at timestamptz)
 *   session_exercises(id uuid, session_id uuid, user_id text, exercise_id, position int, sets int)
 *   exercises(id, is_timed bool, garmin_category text, garmin_subtype text|int)
 *   set_logs(id uuid, session_exercise_id uuid, user_id text, set_index int, weight_kg, reps,
 *            seconds, done bool, source text, garmin_activity_id, updated_at timestamptz)
 */
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasEncryptionSecret } from './crypto';
import { GarminNotConfiguredError } from './errors';
import type { ActivityRecord, ConnectionRow, GarminRepo, SessionContext, SyncOutcome } from './sync';
import type { GarminDaily, MatchSessionExercise, MatchSetLog, SetFill } from './types';

export const FIT_BUCKET = 'garmin-fit';

/** Env vars the Garmin server side needs. Empty array = configured. */
export function missingGarminEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const missing: string[] = [];
  if (!env.NEXT_PUBLIC_SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!hasEncryptionSecret(env.GARMIN_KEY_ENC_SECRET)) missing.push('GARMIN_KEY_ENC_SECRET');
  return missing;
}

export function assertGarminConfigured(): void {
  const missing = missingGarminEnv();
  if (missing.length) throw new GarminNotConfiguredError(missing);
}

let cached: SupabaseClient | null = null;
export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new GarminNotConfiguredError(
      [!url && 'NEXT_PUBLIC_SUPABASE_URL', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean) as string[],
    );
  }
  cached ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

function check<T>(r: { data: T; error: { message: string } | null }, what: string): T {
  if (r.error) throw new Error(`[garmin db] ${what}: ${r.error.message}`);
  return r.data;
}

const CONNECTION_COLS =
  'user_id, api_key_enc, key_last4, key_expires_at, last_synced_at, last_sync_status, last_sync_error';

interface ConnectionDbRow {
  user_id: string;
  api_key_enc: string;
  key_last4: string | null;
  key_expires_at: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
}

const toConnection = (r: ConnectionDbRow): ConnectionRow => ({
  userId: r.user_id,
  apiKeyEnc: r.api_key_enc,
  keyLast4: r.key_last4,
  keyExpiresAt: r.key_expires_at,
  lastSyncedAt: r.last_synced_at,
  lastSyncStatus: r.last_sync_status,
  lastSyncError: r.last_sync_error,
});

const sameUtcDay = (a: string | null, b: string) => !!a && a.slice(0, 10) === b.slice(0, 10);

export interface ConnectionStore {
  saveConnection(input: {
    userId: string;
    apiKeyEnc: string;
    keyLast4: string;
    keyExpiresAt: string | null;
  }): Promise<void>;
  deleteConnection(userId: string): Promise<void>;
}

export function createSupabaseGarminRepo(db: SupabaseClient = getServiceClient()): GarminRepo & ConnectionStore {
  return {
    async getConnection(userId) {
      const r = await db.from('garmin_connections').select(CONNECTION_COLS).eq('user_id', userId).maybeSingle();
      const row = check(r, 'getConnection') as ConnectionDbRow | null;
      return row ? toConnection(row) : null;
    },

    async listConnections() {
      const r = await db.from('garmin_connections').select(CONNECTION_COLS);
      return ((check(r, 'listConnections') ?? []) as ConnectionDbRow[]).map(toConnection);
    },

    async saveConnection({ userId, apiKeyEnc, keyLast4, keyExpiresAt }) {
      const r = await db.from('garmin_connections').upsert(
        {
          user_id: userId,
          api_key_enc: apiKeyEnc,
          key_last4: keyLast4,
          key_expires_at: keyExpiresAt,
          last_sync_status: null,
          last_sync_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      check(r, 'saveConnection');
    },

    async deleteConnection(userId) {
      check(await db.from('garmin_connections').delete().eq('user_id', userId), 'deleteConnection');
    },

    async recordSyncResult(userId, o: SyncOutcome) {
      const patch: Record<string, unknown> = {
        last_sync_status: o.status,
        last_sync_error: o.error,
        last_sync_attempt_at: o.at,
        updated_at: o.at,
      };
      if (o.lastSyncedAt) patch.last_synced_at = o.lastSyncedAt;
      check(await db.from('garmin_connections').update(patch).eq('user_id', userId), 'recordSyncResult');
    },

    async getProcessedActivityIds(userId, ids) {
      if (!ids.length) return new Set();
      const r = await db
        .from('garmin_activities')
        .select('garmin_activity_id, match_status')
        .eq('user_id', userId)
        .in('garmin_activity_id', ids);
      const rows = (check(r, 'getProcessedActivityIds') ?? []) as { garmin_activity_id: string | number; match_status: string }[];
      return new Set(
        rows.filter((x) => x.match_status !== 'error' && x.match_status !== 'no_session').map((x) => String(x.garmin_activity_id)),
      );
    },

    async findSessionForActivity(userId, startTime): Promise<SessionContext | null> {
      const r = await db
        .from('program_sessions')
        .select('id, seq, status, completed_at')
        .eq('user_id', userId)
        .in('status', ['in_progress', 'up_next', 'complete'])
        .order('seq', { ascending: true });
      const sessions = (check(r, 'findSession') ?? []) as {
        id: string;
        seq: number;
        status: string;
        completed_at: string | null;
      }[];
      // Preference: in-progress → completed on the activity's (UTC) day → up next.
      const pickS =
        sessions.find((s) => s.status === 'in_progress') ??
        [...sessions].reverse().find((s) => s.status === 'complete' && sameUtcDay(s.completed_at, startTime)) ??
        sessions.find((s) => s.status === 'up_next');
      if (!pickS) return null;

      const se = check(
        await db
          .from('session_exercises')
          .select('id, position, sets, exercise_id')
          .eq('session_id', pickS.id)
          .order('position', { ascending: true }),
        'session_exercises',
      ) as { id: string; position: number; sets: number; exercise_id: string }[];
      if (!se?.length) return { sessionId: pickS.id, exercises: [], logs: [] };

      const exIds = [...new Set(se.map((x) => x.exercise_id))];
      const exRows = check(
        await db.from('exercises').select('id, is_timed, garmin_category, garmin_subtype').in('id', exIds),
        'exercises',
      ) as { id: string; is_timed: boolean | null; garmin_category: string | null; garmin_subtype: string | number | null }[];
      const exById = new Map((exRows ?? []).map((e) => [String(e.id), e]));

      const exercises: MatchSessionExercise[] = se.map((x) => {
        const e = exById.get(String(x.exercise_id));
        return {
          id: x.id,
          position: x.position,
          sets: x.sets,
          isTimed: !!e?.is_timed,
          garminCategory: e?.garmin_category ?? null,
          garminSubtype: e?.garmin_subtype ?? null,
        };
      });

      const logRows = check(
        await db
          .from('set_logs')
          .select('id, session_exercise_id, set_index, weight_kg, reps, seconds, done')
          .in('session_exercise_id', se.map((x) => x.id)),
        'set_logs',
      ) as {
        id: string;
        session_exercise_id: string;
        set_index: number;
        weight_kg: number | null;
        reps: number | null;
        seconds: number | null;
        done: boolean | null;
      }[];
      const logs: MatchSetLog[] = (logRows ?? []).map((l) => ({
        id: l.id,
        sessionExerciseId: l.session_exercise_id,
        setIndex: l.set_index,
        weightKg: l.weight_kg,
        reps: l.reps,
        seconds: l.seconds,
        done: !!l.done,
      }));
      return { sessionId: pickS.id, exercises, logs };
    },

    async applySetFills(userId, fills: SetFill[], garminActivityId) {
      const now = new Date().toISOString();
      for (const f of fills) {
        const fields: Record<string, unknown> = {
          done: true,
          source: 'watch',
          garmin_activity_id: garminActivityId,
          updated_at: now,
        };
        if (f.weightKg !== undefined) fields.weight_kg = f.weightKg;
        if (f.reps !== undefined) fields.reps = f.reps;
        if (f.seconds !== undefined) fields.seconds = f.seconds;
        if (f.setLogId) {
          // Guard: only rows still not done (the user may have ticked it meanwhile).
          check(
            await db.from('set_logs').update(fields).eq('id', f.setLogId).eq('user_id', userId).eq('done', false),
            'set_logs update',
          );
        } else {
          check(
            await db.from('set_logs').insert({
              id: randomUUID(),
              session_exercise_id: f.sessionExerciseId,
              user_id: userId,
              set_index: f.setIndex,
              ...fields,
            }),
            'set_logs insert',
          );
        }
      }
    },

    async upsertActivity(rec: ActivityRecord) {
      check(
        await db.from('garmin_activities').upsert(
          {
            garmin_activity_id: rec.garminActivityId,
            user_id: rec.userId,
            type: rec.type,
            name: rec.name,
            start_time: rec.startTime,
            duration_s: rec.durationS == null ? null : Math.round(rec.durationS),
            avg_hr: rec.avgHr == null ? null : Math.round(rec.avgHr),
            fit_path: rec.fitPath,
            matched_session_id: rec.matchedSessionId,
            match_status: rec.matchStatus,
            matched_count: rec.matchedCount,
            unmatched_sets: rec.unmatchedSets,
            error: rec.error,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'garmin_activity_id' },
        ),
        'upsertActivity',
      );
    },

    async upsertDailies(userId, dailies: GarminDaily[]) {
      const now = new Date().toISOString();
      const rows = dailies.map((d) => ({
        user_id: userId,
        date: d.date,
        sleep_s: d.sleepS == null ? null : Math.round(d.sleepS),
        resting_hr: d.restingHr == null ? null : Math.round(d.restingHr),
        hrv: d.hrv,
        body_battery: d.bodyBattery == null ? null : Math.round(d.bodyBattery),
        stress_avg: d.stressAvg == null ? null : Math.round(d.stressAvg),
        steps: d.steps == null ? null : Math.round(d.steps),
        raw: d.raw ?? null,
        updated_at: now,
      }));
      check(await db.from('garmin_dailies').upsert(rows, { onConflict: 'user_id,date' }), 'upsertDailies');
    },

    async saveFit(userId, activityId, bytes) {
      const path = `${userId}/${activityId}.fit`;
      const { error } = await db.storage
        .from(FIT_BUCKET)
        .upload(path, bytes, { contentType: 'application/octet-stream', upsert: true });
      if (error) {
        console.warn('[garmin] FIT upload skipped:', error.message);
        return null;
      }
      return path;
    },
  };
}
