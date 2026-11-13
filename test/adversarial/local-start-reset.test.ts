// @vitest-environment node
/**
 * Adversarial: local Start / Reset against sync, pull and concurrent set saves.
 * A FAILING test here demonstrates a defect.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FitDB } from '@/lib/local/db';
import {
  completeSession,
  ensureSettings,
  LocalRuleError,
  resetSession,
  saveSet,
  seedExercises,
  startProgram,
  startSession,
  updateSettings,
} from '@/lib/local/actions';
import { flush } from '@/lib/local/outbox';
import { syncNow } from '@/lib/local/sync';
import { fakeSupabase, type Call } from '../local/fakeSupabase';

const U = 'user_1';
const PID = '22222222-2222-4222-8222-222222222222';
const T0 = new Date('2026-11-10T04:00:00Z');
let db: FitDB;
let n = 0;

beforeEach(async () => {
  db = new FitDB(`adv-start-reset-${++n}`);
  await db.open();
  await seedExercises(db);
  await ensureSettings(db, U);
  await updateSettings(db, U, { timezone: 'UTC', unlock_rule: 'next_calendar_day' }, new Date('2026-11-10T00:00:00Z'));
  await startProgram(db, U, { programId: PID, now: new Date('2026-11-10T03:00:00Z') });
});

const s1 = async () => (await db.program_sessions.where('[program_id+seq]').equals([PID, 1]).first())!;
const exercisesOf = async (sid: string) => (await db.session_exercises.where('session_id').equals(sid).toArray()).sort((a, b) => a.position - b.position);
const logsOf = async (sid: string) => db.set_logs.where('session_id').equals(sid).toArray();

async function logAllSets(sid: string) {
  for (const se of await exercisesOf(sid)) for (let i = 0; i < se.sets; i++) {
    await saveSet(db, U, { sessionExerciseId: se.id, setIndex: i, patch: { weight_kg: 40, reps: se.rep_hi, done: true } }, T0);
  }
}

/** Snapshot local Dexie as the "server" tables a pull will read. */
async function serverTables() {
  return {
    user_settings: await db.user_settings.toArray(),
    programs: await db.programs.toArray(),
    program_sessions: (await db.program_sessions.toArray()).map((s) => ({ ...s })),
    session_exercises: await db.session_exercises.toArray(),
    set_logs: (await db.set_logs.toArray()).map((l) => ({ ...l })),
    body_weights: [] as unknown[],
  };
}

/** A client whose pull blocks at refresh_unlocks until `release()` is called. */
function gatedClient(tables: Record<string, unknown[]>) {
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const pullStarted = new Promise<void>((r) => (entered = r));
  let gated = true;
  const { client, calls } = fakeSupabase({
    tables,
    respond: async (c: Call) => {
      if (c.kind === 'rpc' && c.fn === 'refresh_unlocks' && gated) {
        gated = false;
        entered();
        await gate;
      }
      return { error: null, status: 200 };
    },
  });
  return { client, calls, release, pullStarted };
}

describe('adversarial: local start/reset', () => {
  it('a set save racing Reset (blur fires just before the Reset tap) must not leave a set or a set write after reset_session', async () => {
    const s = await s1();
    await startSession(db, U, s.id, T0);
    const [se] = await exercisesOf(s.id);
    await saveSet(db, U, { sessionExerciseId: se.id, setIndex: 0, patch: { weight_kg: 40, reps: 8, done: true } }, T0);

    // Blur on the weight field of set 1 fires saveSet; the same tap opens Reset.
    const save = saveSet(db, U, { sessionExerciseId: se.id, setIndex: 1, patch: { weight_kg: 42.5 } }, T0);
    const reset = resetSession(db, U, s.id, T0);
    await Promise.allSettled([save, reset]);

    const ops = (await db.outbox.orderBy('seq').toArray()).map((o) => o.payload);
    const resetAt = ops.findIndex((p) => p.kind === 'rpc' && p.fn === 'reset_session');
    const setWritesAfterReset = ops.slice(resetAt + 1).filter((p) => p.kind === 'upsert' && p.table === 'set_logs');

    expect((await s1()).status).toBe('up_next');
    // An upsert after reset_session re-inserts into the up_next session on the server,
    // and the set_logs trigger flips it back to in_progress (a silent re-start).
    expect(setWritesAfterReset).toHaveLength(0);
    expect(await logsOf(s.id)).toHaveLength(0);
  });

  it('Reset during an in-flight pull is undone by the pull (sets resurrected, session back in progress)', async () => {
    const s = await s1();
    await startSession(db, U, s.id, T0);
    await logAllSets(s.id);
    await flush(db, fakeSupabase().client); // everything synced; outbox empty
    expect(await db.outbox.count()).toBe(0);

    const tables = await serverTables(); // server: in_progress with all sets
    const g = gatedClient(tables);
    const sync = syncNow(db, g.client, U);
    await g.pullStarted; // flush done, pull running (network)
    await resetSession(db, U, s.id, T0); // user taps Reset now
    g.release();
    await sync;

    // The user just reset: the session should be up next with no sets locally.
    expect((await s1()).status).toBe('up_next');
    expect(await logsOf(s.id)).toHaveLength(0);
  });

  it('after a reset, stale local sets survive the next pull and let the session complete locally with zero new sets', async () => {
    const s = await s1();
    await startSession(db, U, s.id, T0);
    await logAllSets(s.id);
    await flush(db, fakeSupabase().client);

    // Same race as above, then the reset_session reaches the server.
    const tables = await serverTables();
    const g = gatedClient(tables);
    const sync = syncNow(db, g.client, U);
    await g.pullStarted;
    await resetSession(db, U, s.id, T0);
    g.release();
    await sync;

    // Server applied reset_session: session up_next, its sets deleted.
    const after = await serverTables();
    after.program_sessions = after.program_sessions.map((x) => (x.id === s.id ? { ...x, status: 'up_next', started_at: null } : x));
    after.set_logs = after.set_logs.filter((l) => l.session_id !== s.id);
    await syncNow(db, fakeSupabase({ tables: after }).client, U);
    expect((await s1()).status).toBe('up_next');

    // Start again and immediately complete without logging anything.
    await startSession(db, U, s.id, new Date('2026-11-10T06:00:00Z'));
    await expect(completeSession(db, U, s.id, new Date('2026-11-10T06:01:00Z'))).rejects.toThrow('incomplete');
  });

  it('second device: a pull after the other device reset leaves the deleted sets on this device', async () => {
    const s = await s1();
    await startSession(db, U, s.id, T0);
    await logAllSets(s.id);
    await flush(db, fakeSupabase().client);

    // Other device reset the session on the server.
    const tables = await serverTables();
    tables.program_sessions = tables.program_sessions.map((x) => (x.id === s.id ? { ...x, status: 'up_next', started_at: null } : x));
    tables.set_logs = [];
    await syncNow(db, fakeSupabase({ tables }).client, U);

    expect((await s1()).status).toBe('up_next');
    expect(await logsOf(s.id)).toHaveLength(0); // up_next must not carry logged sets
  });

  it('Start tapped during an in-flight pull is reverted by the pull; the next set save is refused with not_started', async () => {
    await flush(db, fakeSupabase().client);
    const s = await s1();
    const tables = await serverTables(); // server: up_next
    const g = gatedClient(tables);
    const sync = syncNow(db, g.client, U);
    await g.pullStarted;
    await startSession(db, U, s.id, T0); // user taps Start right after opening the app
    g.release();
    await sync;

    const [se] = await exercisesOf(s.id);
    let err: unknown = null;
    try {
      await saveSet(db, U, { sessionExerciseId: se.id, setIndex: 0, patch: { weight_kg: 40, reps: 8, done: true } }, T0);
    } catch (e) {
      err = e;
    }
    expect(err instanceof LocalRuleError ? err.code : err).toBeNull();
    expect((await s1()).status).toBe('in_progress');
  });

  it('holds: start/reset on locked, complete and unknown ids', async () => {
    const s2 = (await db.program_sessions.where('[program_id+seq]').equals([PID, 2]).first())!;
    await expect(startSession(db, U, s2.id, T0)).rejects.toThrow('locked');
    await expect(resetSession(db, U, s2.id, T0)).rejects.toThrow('locked');
    await expect(startSession(db, U, 'nope', T0)).rejects.toThrow('not_found');
    const s = await s1();
    await startSession(db, U, s.id, T0);
    await logAllSets(s.id);
    await completeSession(db, U, s.id, T0);
    await expect(resetSession(db, U, s.id, T0)).rejects.toThrow('session_complete');
    expect((await logsOf(s.id)).length).toBeGreaterThan(0);
    const before = await db.outbox.count();
    await startSession(db, U, s.id, T0); // no-op on complete
    expect(await db.outbox.count()).toBe(before);
  });

  it('holds: reset then re-start before sync queues start, reset, start in order and drops the discarded set writes', async () => {
    const s = await s1();
    await startSession(db, U, s.id, T0);
    const [se] = await exercisesOf(s.id);
    await saveSet(db, U, { sessionExerciseId: se.id, setIndex: 0, patch: { weight_kg: 40 } }, T0);
    await resetSession(db, U, s.id, T0);
    await startSession(db, U, s.id, new Date('2026-11-10T05:00:00Z'));
    const fns = (await db.outbox.orderBy('seq').toArray())
      .map((o) => o.payload)
      .filter((p) => p.kind === 'rpc' || (p.kind === 'upsert' && p.table === 'set_logs'))
      .map((p) => (p.kind === 'rpc' ? p.fn : 'set_logs'));
    expect(fns).toEqual(['start_session', 'reset_session', 'start_session']);
  });
});
