/**
 * "Finish later" pause, local only (UX_PLAN §2.5). The session stays
 * in_progress (progression rules unchanged); the phone remembers active time
 * so the timer shows time actually training, not wall-clock since Start.
 * Stored in Dexie `meta`, never synced.
 */
import { getMeta, setMeta, type FitDB } from './db';

export interface PauseState {
  /** Active time banked before the current run of activity, ms. */
  activeMs: number;
  /** When activity last resumed (ISO), or null while paused. */
  resumedAt: string | null;
}

export const pauseKey = (sessionId: string) => `pause:${sessionId}`;

/**
 * Effective state: a session without a record has been active since
 * started_at. Without a start time either (e.g. started by watch data) it is
 * running, never paused; activeMs() reads an unparsable time as 0.
 */
export function effectivePause(stored: PauseState | undefined, startedAt: string | null): PauseState {
  if (stored) return stored;
  return { activeMs: 0, resumedAt: startedAt ?? '' };
}

export function isPaused(p: PauseState): boolean {
  return p.resumedAt === null;
}

/** Active training time in ms at `now`. Non-finite input never yields NaN. */
export function activeMs(p: PauseState, now: number): number {
  const since = p.resumedAt ? now - new Date(p.resumedAt).getTime() : 0;
  const total = p.activeMs + (Number.isFinite(since) ? Math.max(0, since) : 0);
  return Number.isFinite(total) ? Math.max(0, total) : 0;
}

export async function pauseSession(db: FitDB, sessionId: string, startedAt: string | null, now = new Date()): Promise<PauseState> {
  const cur = effectivePause(await getMeta<PauseState>(db, pauseKey(sessionId)), startedAt);
  if (isPaused(cur)) return cur;
  const next: PauseState = { activeMs: activeMs(cur, now.getTime()), resumedAt: null };
  await setMeta(db, pauseKey(sessionId), next);
  return next;
}

export async function resumeSession(db: FitDB, sessionId: string, startedAt: string | null, now = new Date()): Promise<PauseState> {
  const cur = effectivePause(await getMeta<PauseState>(db, pauseKey(sessionId)), startedAt);
  if (!isPaused(cur)) return cur;
  const next: PauseState = { activeMs: cur.activeMs, resumedAt: now.toISOString() };
  await setMeta(db, pauseKey(sessionId), next);
  return next;
}

export async function clearPause(db: FitDB, sessionId: string): Promise<void> {
  await db.meta.delete(pauseKey(sessionId));
}
