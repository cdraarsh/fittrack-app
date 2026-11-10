'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createSupabaseClient } from '@/lib/supabase';
import { OWNER_ID } from '@/lib/owner';
import { advance } from '@/lib/program/unlock';
import type { Exercise } from '@/lib/exercises/types';
import type { ProgramSession, SessionExercise, SetLog } from '@/lib/program/types';
import { ensureSettings, lastWeightFor, refreshProgress, seedExercises } from './actions';
import { getDb, getMeta, setMeta } from './db';
import { OUTBOX_EVENT } from './outbox';
import { syncNow } from './sync';

// ─── Sync status store ────────────────────────────────────────────────────────

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error';
  lastError: string | null;
  lastSyncedAt: string | null;
}
let status: SyncStatus = { state: 'idle', lastError: null, lastSyncedAt: null };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
    () => status,
  );
}

let runSync: (() => Promise<void>) | null = null;
/** "Sync now" from anywhere (e.g. Settings). */
export function requestSync(): Promise<void> {
  return runSync ? runSync() : Promise.resolve();
}

// ─── User ─────────────────────────────────────────────────────────────────────

/** The single owner's id (no sign-in). Kept as a hook so callers stay unchanged. */
export function useLocalUserId(): string {
  return OWNER_ID;
}

// ─── Engine: run once in the app layout ───────────────────────────────────────

/**
 * Local-first sync loop: seeds the library, ensures settings, re-runs local
 * unlocks, and flushes/pulls on open, `online`, `visibilitychange` and after
 * local writes (Safari has no Background Sync).
 */
export function useSyncEngine(): void {
  const userId = OWNER_ID;
  const localUserId = userId;
  const client = useMemo(() => createSupabaseClient(), []);

  const sync = useCallback(async () => {
    if (!userId || typeof navigator === 'undefined') return;
    if (!navigator.onLine) {
      setStatus({ state: 'offline' });
      return;
    }
    setStatus({ state: 'syncing' });
    try {
      const r = await syncNow(getDb(), client, userId);
      setStatus({
        state: r.blocked ? 'error' : 'idle',
        lastError: r.lastError,
        lastSyncedAt: (await getMeta<string>(getDb(), 'last_synced_at')) ?? null,
      });
    } catch (e) {
      setStatus({ state: 'error', lastError: e instanceof Error ? e.message : String(e) });
    }
  }, [client, userId]);

  useEffect(() => {
    runSync = sync;
    return () => {
      if (runSync === sync) runSync = null;
    };
  }, [sync]);

  // Open: library, settings, persistence, local unlocks, first sync.
  useEffect(() => {
    if (!localUserId) return;
    const db = getDb();
    void (async () => {
      await seedExercises(db);
      await ensureSettings(db, localUserId);
      await refreshProgress(db, localUserId);
      if (!(await getMeta<boolean>(db, 'persist_requested'))) {
        await setMeta(db, 'persist_requested', true);
        try {
          await navigator.storage?.persist?.();
        } catch {
          /* not supported */
        }
      }
      void sync();
    })();
  }, [localUserId, sync]);

  // Triggers.
  useEffect(() => {
    if (!localUserId) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const onOutbox = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => void sync(), 1500);
    };
    const onOnline = () => void sync();
    const onOffline = () => setStatus({ state: 'offline' });
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshProgress(getDb(), localUserId);
      void sync(); // flush on hide too: the OS may freeze us next
    };
    const tick = setInterval(() => void refreshProgress(getDb(), localUserId), 60_000);
    window.addEventListener(OUTBOX_EVENT, onOutbox);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (debounce) clearTimeout(debounce);
      clearInterval(tick);
      window.removeEventListener(OUTBOX_EVENT, onOutbox);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [localUserId, sync]);
}

// ─── Data hooks ───────────────────────────────────────────────────────────────

export function useSettings(userId: string | null | undefined) {
  return useLiveQuery(() => (userId ? getDb().user_settings.get(userId) : undefined), [userId]);
}

/** Active program, null if none, undefined while loading. */
export function useActiveProgram(userId: string | null | undefined) {
  return useLiveQuery(
    async () => {
      if (!userId) return undefined;
      return (await getDb().programs.where('user_id').equals(userId).filter((p) => p.status === 'active').first()) ?? null;
    },
    [userId],
  );
}

/** Latest program (active or finished), for "offer the next block". */
export function useLatestProgram(userId: string | null | undefined) {
  return useLiveQuery(
    async () => {
      if (!userId) return undefined;
      const all = await getDb().programs.where('user_id').equals(userId).toArray();
      return all.sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    },
    [userId],
  );
}

export function useProgramSessions(programId: string | null | undefined): ProgramSession[] | undefined {
  return useLiveQuery(
    async () => (programId ? (await getDb().program_sessions.where('program_id').equals(programId).sortBy('seq')) : []),
    [programId],
  );
}

/** Progress view (current / waiting / unlock date) computed with the shared state machine, read-only. */
export function useProgress(sessions: ProgramSession[] | undefined, rule: 'immediate' | 'next_calendar_day', timeZone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => (sessions ? advance(sessions, { type: 'refresh' }, { rule, timeZone, now }) : undefined), [sessions, rule, timeZone, now]);
}

export interface SessionBundleItem {
  se: SessionExercise;
  exercise: Exercise | undefined;
  prescribed: Exercise | undefined;
  logs: SetLog[];
}
export interface SessionBundle {
  session: ProgramSession;
  items: SessionBundleItem[];
}

export function useSessionBundle(sessionId: string | null | undefined): SessionBundle | null | undefined {
  return useLiveQuery(async () => {
    if (!sessionId) return null;
    const db = getDb();
    const session = await db.program_sessions.get(sessionId);
    if (!session) return null;
    const ses = (await db.session_exercises.where('session_id').equals(sessionId).toArray()).sort((a, b) => a.position - b.position);
    const logs = await db.set_logs.where('session_id').equals(sessionId).toArray();
    const ids = [...new Set(ses.flatMap((s) => [s.exercise_id, s.prescribed_exercise_id]))];
    const exs = new Map((await db.exercises.bulkGet(ids)).filter(Boolean).map((e) => [e!.id, e!]));
    return {
      session,
      items: ses.map((se) => ({
        se,
        exercise: exs.get(se.exercise_id),
        prescribed: exs.get(se.prescribed_exercise_id),
        logs: logs.filter((l) => l.session_exercise_id === se.id),
      })),
    };
  }, [sessionId]);
}

export function useLastWeights(exerciseIds: string[], excludeSessionId: string | undefined): Record<string, number | null> | undefined {
  const key = exerciseIds.join(',');
  return useLiveQuery(async () => {
    const db = getDb();
    const out: Record<string, number | null> = {};
    for (const id of exerciseIds) out[id] = await lastWeightFor(db, id, excludeSessionId);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, excludeSessionId]);
}

export function useSwapOptions(exerciseId: string | undefined) {
  return useLiveQuery(async () => {
    if (!exerciseId) return [];
    const db = getDb();
    const me = await db.exercises.get(exerciseId);
    if (!me) return [];
    return db.exercises.where('swap_group').equals(me.swap_group).toArray();
  }, [exerciseId]);
}

export function useOutboxCounts() {
  return useLiveQuery(async () => {
    const all = await getDb().outbox.toArray();
    return {
      pending: all.filter((o) => o.status === 'pending').length,
      failed: all.filter((o) => o.status === 'failed'),
    };
  }, []);
}

export function useCompletedSessions(userId: string | null | undefined) {
  return useLiveQuery(async () => {
    if (!userId) return [];
    const db = getDb();
    const done = await db.program_sessions.where('status').equals('complete').toArray();
    return done.filter((s) => s.user_id === userId).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  }, [userId]);
}

export function useBodyWeights(userId: string | null | undefined) {
  return useLiveQuery(async () => {
    if (!userId) return [];
    return (await getDb().body_weights.where('date').above('').toArray()).filter((b) => b.user_id === userId).sort((a, b) => b.date.localeCompare(a.date));
  }, [userId]);
}
