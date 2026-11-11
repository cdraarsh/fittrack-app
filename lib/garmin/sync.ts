/**
 * Garmin sync orchestration. Everything external is injected (repo, API,
 * token exchange, key decryption, FIT decode, clock) so this runs in tests
 * without network or database.
 *
 * Flow per user: fresh token → activities + dailies since last sync →
 *   strength: FIT download → decode → match → fill empty set_logs (source 'watch')
 *   cardio:   link activity to the session (matched_session_id)
 *   dailies:  upsert garmin_dailies
 */
import { FIRST_SYNC_LOOKBACK_DAYS, STRENGTH_TYPE_KEYS, SYNC_OVERLAP_DAYS } from './endpoints';
import { GarminAuthError } from './errors';
import { matchWatchSets } from './matcher';
import type { GarminApi } from './client';
import type { GarminAccessToken } from './token';
import type {
  GarminActivitySummary,
  GarminDaily,
  LeftoverSet,
  MatchSessionExercise,
  MatchSetLog,
  SetFill,
  WatchSet,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ConnectionRow {
  userId: string;
  apiKeyEnc: string;
  keyLast4: string | null;
  keyExpiresAt: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export interface SessionContext {
  sessionId: string;
  exercises: MatchSessionExercise[];
  logs: MatchSetLog[];
}

export type ActivityMatchStatus =
  | 'matched' // strength, every active set placed
  | 'review' // strength, some sets in the review tray
  | 'no_session' // no session to attach to (retried next sync)
  | 'cardio_linked'
  | 'error'; // retried next sync

export interface ActivityRecord {
  userId: string;
  garminActivityId: string;
  type: string;
  name: string | null;
  startTime: string;
  durationS: number | null;
  avgHr: number | null;
  fitPath: string | null;
  matchedSessionId: string | null;
  matchStatus: ActivityMatchStatus;
  matchedCount: number;
  unmatchedSets: LeftoverSet[];
  error: string | null;
}

export interface SyncOutcome {
  at: string;
  status: 'ok' | 'partial' | 'auth_error' | 'error';
  error: string | null;
  /** New watermark; null leaves last_synced_at unchanged. */
  lastSyncedAt: string | null;
}

export interface GarminRepo {
  getConnection(userId: string): Promise<ConnectionRow | null>;
  listConnections(): Promise<ConnectionRow[]>;
  /** Activity ids already processed for good (status not 'error' / 'no_session'). */
  getProcessedActivityIds(userId: string, ids: string[]): Promise<Set<string>>;
  findSessionForActivity(userId: string, startTime: string): Promise<SessionContext | null>;
  applySetFills(userId: string, fills: SetFill[], garminActivityId: string): Promise<void>;
  upsertActivity(rec: ActivityRecord): Promise<void>;
  upsertDailies(userId: string, dailies: GarminDaily[]): Promise<void>;
  /** Store the FIT file; returns its storage path, or null if storage is unavailable. */
  saveFit(userId: string, activityId: string, bytes: Uint8Array): Promise<string | null>;
  recordSyncResult(userId: string, outcome: SyncOutcome): Promise<void>;
}

export interface SyncDeps {
  repo: GarminRepo;
  api: GarminApi;
  exchangeToken: (apiKey: string) => Promise<GarminAccessToken>;
  decryptKey: (enc: string) => string;
  decodeFit: (bytes: Uint8Array) => WatchSet[];
  now?: () => Date;
}

export interface SyncResult {
  userId: string;
  status: 'ok' | 'partial' | 'auth_error' | 'error' | 'not_connected';
  error: string | null;
  window: { startDate: string; endDate: string } | null;
  activities: {
    seen: number;
    skipped: number;
    strength: number;
    cardio: number;
    filledSets: number;
    reviewSets: number;
    noSession: number;
    errors: number;
  };
  dailies: number;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function syncWindow(lastSyncedAt: string | null, now: Date): { startDate: string; endDate: string } {
  const start = lastSyncedAt
    ? new Date(new Date(lastSyncedAt).getTime() - SYNC_OVERLAP_DAYS * DAY_MS)
    : new Date(now.getTime() - FIRST_SYNC_LOOKBACK_DAYS * DAY_MS);
  return { startDate: ymd(start), endDate: ymd(now) };
}

export function isStrength(a: GarminActivitySummary): boolean {
  return STRENGTH_TYPE_KEYS.has(a.typeKey.toLowerCase());
}

function emptyResult(userId: string): SyncResult {
  return {
    userId,
    status: 'ok',
    error: null,
    window: null,
    activities: { seen: 0, skipped: 0, strength: 0, cardio: 0, filledSets: 0, reviewSets: 0, noSession: 0, errors: 0 },
    dailies: 0,
  };
}

function baseRecord(userId: string, a: GarminActivitySummary): ActivityRecord {
  return {
    userId,
    garminActivityId: a.activityId,
    type: a.typeKey,
    name: a.name,
    startTime: a.startTime,
    durationS: a.durationS,
    avgHr: a.avgHr,
    fitPath: null,
    matchedSessionId: null,
    matchStatus: 'error',
    matchedCount: 0,
    unmatchedSets: [],
    error: null,
  };
}

async function processStrength(
  userId: string,
  token: string,
  a: GarminActivitySummary,
  deps: SyncDeps,
  res: SyncResult,
): Promise<ActivityRecord> {
  const rec = baseRecord(userId, a);
  const bytes = await deps.api.downloadFit(token, a.activityId);
  try {
    rec.fitPath = await deps.repo.saveFit(userId, a.activityId, bytes);
  } catch (e) {
    console.warn('[garmin] saveFit failed (continuing):', (e as Error).message);
  }
  const sets = deps.decodeFit(bytes);
  const active = sets.filter((s) => s.setType === 'active');

  const session = await deps.repo.findSessionForActivity(userId, a.startTime);
  if (!session) {
    rec.matchStatus = 'no_session';
    rec.unmatchedSets = active.map((set) => ({ set, reason: 'no_session' }));
    res.activities.noSession++;
    return rec;
  }

  const { fills, leftovers } = matchWatchSets(sets, session.exercises, session.logs);
  if (fills.length) await deps.repo.applySetFills(userId, fills, a.activityId);
  rec.matchedSessionId = session.sessionId;
  rec.matchedCount = fills.length;
  rec.unmatchedSets = leftovers;
  rec.matchStatus = leftovers.length ? 'review' : 'matched';
  res.activities.filledSets += fills.length;
  res.activities.reviewSets += leftovers.length;
  return rec;
}

async function processCardio(
  userId: string,
  a: GarminActivitySummary,
  deps: SyncDeps,
  res: SyncResult,
): Promise<ActivityRecord> {
  const rec = baseRecord(userId, a);
  const session = await deps.repo.findSessionForActivity(userId, a.startTime);
  if (!session) {
    rec.matchStatus = 'no_session';
    res.activities.noSession++;
    return rec;
  }
  rec.matchedSessionId = session.sessionId;
  rec.matchStatus = 'cardio_linked';
  return rec;
}

/** Sync one user. Never throws; failures are reported in the result and recorded on the connection. */
export async function syncUser(userId: string, deps: SyncDeps): Promise<SyncResult> {
  const now = (deps.now ?? (() => new Date()))();
  const res = emptyResult(userId);
  const finish = async (outcome: Omit<SyncOutcome, 'at'>) => {
    try {
      await deps.repo.recordSyncResult(userId, { at: now.toISOString(), ...outcome });
    } catch (e) {
      console.error('[garmin] recordSyncResult failed:', (e as Error).message);
    }
  };

  let conn: ConnectionRow | null;
  try {
    conn = await deps.repo.getConnection(userId);
  } catch (e) {
    return { ...res, status: 'error', error: (e as Error).message };
  }
  if (!conn) return { ...res, status: 'not_connected', error: 'No Garmin connection' };

  const window = syncWindow(conn.lastSyncedAt, now);
  res.window = window;

  try {
    const token = (await deps.exchangeToken(deps.decryptKey(conn.apiKeyEnc))).accessToken;

    const [activities, dailies] = await Promise.all([
      deps.api.listActivities(token, window.startDate, window.endDate),
      deps.api.getDailies(token, window.startDate, window.endDate),
    ]);

    if (dailies.length) await deps.repo.upsertDailies(userId, dailies);
    res.dailies = dailies.length;

    res.activities.seen = activities.length;
    const done = await deps.repo.getProcessedActivityIds(userId, activities.map((a) => a.activityId));
    const todo = activities
      .filter((a) => !done.has(a.activityId))
      .sort((x, y) => x.startTime.localeCompare(y.startTime));
    res.activities.skipped = activities.length - todo.length;

    let earliestError: string | null = null;
    for (const a of todo) {
      let rec: ActivityRecord;
      try {
        if (isStrength(a)) {
          res.activities.strength++;
          rec = await processStrength(userId, token, a, deps, res);
        } else {
          res.activities.cardio++;
          rec = await processCardio(userId, a, deps, res);
        }
      } catch (e) {
        if (e instanceof GarminAuthError) throw e;
        rec = { ...baseRecord(userId, a), matchStatus: 'error', error: (e as Error).message };
        res.activities.errors++;
        if (!earliestError || a.startTime < earliestError) earliestError = a.startTime;
      }
      await deps.repo.upsertActivity(rec);
    }

    // Don't move the watermark past an activity that failed, so it is retried.
    const watermark = earliestError && earliestError < now.toISOString() ? earliestError : now.toISOString();
    res.status = res.activities.errors ? 'partial' : 'ok';
    res.error = res.activities.errors ? `${res.activities.errors} activit${res.activities.errors === 1 ? 'y' : 'ies'} failed` : null;
    await finish({ status: res.status as 'ok' | 'partial', error: res.error, lastSyncedAt: watermark });
    return res;
  } catch (e) {
    const auth = e instanceof GarminAuthError;
    res.status = auth ? 'auth_error' : 'error';
    res.error = auth
      ? 'Garmin rejected the API key — it may be expired or deleted. Paste a new key in Settings.'
      : (e as Error).message;
    await finish({ status: res.status, error: res.error, lastSyncedAt: null });
    return res;
  }
}

/** Sync every connection sequentially (cron). */
export async function syncAll(deps: SyncDeps): Promise<SyncResult[]> {
  const conns = await deps.repo.listConnections();
  const out: SyncResult[] = [];
  for (const c of conns) out.push(await syncUser(c.userId, deps));
  return out;
}
