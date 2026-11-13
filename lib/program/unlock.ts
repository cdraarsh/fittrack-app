/**
 * The locked-progression state machine. ONE pure function (`advance`) decides
 * every status change; the phone runs it offline and Postgres mirrors it in
 * `complete_session()` / `refresh_unlocks()` (supabase/migrations/20261110000000_v2_core.sql).
 *
 *   locked → up_next      previous session complete AND (rule `immediate` OR a
 *                         later local calendar day than its completion)
 *   up_next → in_progress Start tapped (or, for watch data, first set logged)
 *   in_progress → up_next  Reset: an accidental start; its sets are discarded
 *   in_progress → complete every prescribed working set done (checked by caller)
 *
 * No skipping, no reordering: only the first non-complete session can ever be
 * active, every later one is locked. Missed calendar days only delay — sessions
 * are numbered, not dated.
 */

export type SessionStatus = 'locked' | 'up_next' | 'in_progress' | 'complete';
export type UnlockRule = 'immediate' | 'next_calendar_day';

export interface SessionNode {
  id: string;
  seq: number;
  status: SessionStatus;
  unlocked_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export type ProgressionEvent =
  /** Re-evaluate unlocks (app open, day change, after sync). */
  | { type: 'refresh' }
  /** A set was written for this session. */
  | { type: 'log_set'; sessionId: string }
  /** User tapped Start. */
  | { type: 'start'; sessionId: string }
  /** User reset an in-progress session back to up next (caller discards its sets). */
  | { type: 'reset'; sessionId: string }
  /** User asked to complete; caller says whether every working set is done. */
  | { type: 'complete'; sessionId: string; allWorkingSetsDone: boolean };

export interface ProgressionContext {
  rule: UnlockRule;
  /** IANA zone used to decide what "a later calendar day" means. */
  timeZone: string;
  now: Date | string;
}

export type ProgressionError = 'not_found' | 'locked' | 'incomplete' | 'already_complete';

export interface ProgressionResult<T extends SessionNode> {
  ok: boolean;
  error?: ProgressionError;
  /** Same sessions, sorted by seq; changed rows are new objects. */
  sessions: T[];
  /** Ids of sessions whose state changed. */
  changed: string[];
  /** The session the user can work on now (up_next / in_progress), if any. */
  current: T | null;
  /** First locked session waiting on the calendar rule, if any. */
  waiting: T | null;
  /** Local date (YYYY-MM-DD) on which `waiting` unlocks. */
  unlocksOn: string | null;
  /** Every session complete → offer the next block. */
  programComplete: boolean;
}

/** Local calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(instant: Date | string, timeZone: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Is a session whose predecessor completed at `prevCompletedAt` unlockable at `now`? */
export function isUnlockDue(prevCompletedAt: string, now: Date | string, rule: UnlockRule, timeZone: string): boolean {
  if (rule === 'immediate') return true;
  return localDate(now, timeZone) > localDate(prevCompletedAt, timeZone);
}

export function advance<T extends SessionNode>(
  input: readonly T[],
  event: ProgressionEvent,
  ctx: ProgressionContext,
): ProgressionResult<T> {
  const nowIso = typeof ctx.now === 'string' ? ctx.now : ctx.now.toISOString();
  const sessions = [...input].sort((a, b) => a.seq - b.seq);
  const changed = new Set<string>();

  const put = (i: number, patch: Partial<SessionNode>) => {
    sessions[i] = { ...sessions[i], ...patch };
    changed.add(sessions[i].id);
  };

  /** Unlock the first non-complete session if the rule allows; lock everything after it. */
  const refresh = () => {
    const i = sessions.findIndex((s) => s.status !== 'complete');
    if (i === -1) return;
    const s = sessions[i];
    if (s.status === 'locked') {
      const prev = i > 0 ? sessions[i - 1] : null;
      const due = !prev || (prev.completed_at !== null && isUnlockDue(prev.completed_at, nowIso, ctx.rule, ctx.timeZone));
      if (due) put(i, { status: 'up_next', unlocked_at: nowIso });
    }
    // Defensive: nothing after the frontier may be open.
    for (let j = i + 1; j < sessions.length; j++) {
      if (sessions[j].status !== 'locked' && sessions[j].status !== 'complete') {
        put(j, { status: 'locked', unlocked_at: null });
      }
    }
  };

  const finish = (ok: boolean, error?: ProgressionError): ProgressionResult<T> => {
    const frontier = sessions.find((s) => s.status !== 'complete') ?? null;
    const current = frontier && (frontier.status === 'up_next' || frontier.status === 'in_progress') ? frontier : null;
    const waiting = frontier && frontier.status === 'locked' ? frontier : null;
    let unlocksOn: string | null = null;
    if (waiting) {
      const prev = sessions[sessions.indexOf(waiting) - 1];
      if (prev?.completed_at) {
        unlocksOn = ctx.rule === 'immediate' ? localDate(nowIso, ctx.timeZone) : addDays(localDate(prev.completed_at, ctx.timeZone), 1);
      }
    }
    return {
      ok,
      error,
      sessions,
      changed: [...changed],
      current,
      waiting,
      unlocksOn,
      programComplete: sessions.length > 0 && frontier === null,
    };
  };

  refresh();
  if (event.type === 'refresh') return finish(true);

  const i = sessions.findIndex((s) => s.id === event.sessionId);
  if (i === -1) return finish(false, 'not_found');
  const s = sessions[i];

  if (s.status === 'locked') return finish(false, 'locked');

  if (event.type === 'log_set' || event.type === 'start') {
    if (s.status === 'up_next') put(i, { status: 'in_progress', started_at: s.started_at ?? nowIso });
    return finish(true);
  }

  if (event.type === 'reset') {
    if (s.status === 'complete') return finish(false, 'already_complete');
    if (s.status === 'in_progress') put(i, { status: 'up_next', started_at: null });
    return finish(true); // up_next: nothing to undo
  }

  // complete
  if (s.status === 'complete') return finish(true); // idempotent
  if (!event.allWorkingSetsDone) return finish(false, 'incomplete');
  put(i, { status: 'complete', started_at: s.started_at ?? nowIso, completed_at: nowIso });
  refresh();
  return finish(true);
}
