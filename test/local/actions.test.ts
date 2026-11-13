// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FitDB } from '@/lib/local/db';
import {
  completeSession,
  ensureSettings,
  lastWeightFor,
  LocalRuleError,
  refreshProgress,
  saveBodyWeight,
  saveSet,
  startSession,
  resetSession,
  seedExercises,
  startProgram,
  swapExercise,
  updateSessionFields,
  updateSettings,
} from '@/lib/local/actions';
import { mergeSetLog } from '@/lib/local/merge';
import { syncNow } from '@/lib/local/sync';
import type { SetLog } from '@/lib/program/types';
import { fakeSupabase } from './fakeSupabase';

const U = 'user_1';
const PID = '11111111-1111-4111-8111-111111111111';
let db: FitDB;
let n = 0;

const at = (s: string) => new Date(s);
const statusOf = async () => (await db.program_sessions.where('program_id').equals(PID).sortBy('seq')).slice(0, 3).map((s) => s.status);

/** The session for `seq`; an up-next one is started first (logging needs Start). */
async function sessionExercises(seq: number, now?: Date) {
  let s = (await db.program_sessions.where('[program_id+seq]').equals([PID, seq]).first())!;
  if (s.status === 'up_next') {
    await startSession(db, U, s.id, now);
    s = (await db.program_sessions.get(s.id))!;
  }
  const ses = (await db.session_exercises.where('session_id').equals(s.id).toArray()).sort((a, b) => a.position - b.position);
  return { s, ses };
}

async function doAllSets(seq: number, now: Date, weight = 40) {
  const { s, ses } = await sessionExercises(seq, now);
  for (const se of ses) for (let i = 0; i < se.sets; i++) {
    await saveSet(db, U, { sessionExerciseId: se.id, setIndex: i, patch: { weight_kg: weight, reps: se.rep_hi, done: true } }, now);
  }
  return s;
}

beforeEach(async () => {
  db = new FitDB(`test-actions-${++n}`);
  await db.open();
  await seedExercises(db);
  await ensureSettings(db, U);
  await updateSettings(db, U, { timezone: 'Asia/Kolkata', unlock_rule: 'next_calendar_day' }, at('2026-11-10T00:00:00Z'));
  await startProgram(db, U, { programId: PID, now: at('2026-11-10T03:00:00Z') });
});

describe('local actions', () => {
  it('startProgram writes 64 sessions locally and queues insert-only upserts', async () => {
    expect(await db.program_sessions.count()).toBe(64);
    const ops = (await db.outbox.orderBy('seq').toArray()).map((o) => o.payload);
    const tables = ops.filter((p) => p.kind === 'upsert').map((p) => (p.kind === 'upsert' ? p.table : ''));
    expect(tables.slice(0, 1)).toEqual(['user_settings']);
    expect(tables).toContain('programs');
    expect(ops.find((p) => p.kind === 'upsert' && p.table === 'program_sessions')).toMatchObject({ ignoreDuplicates: true });
    await expect(startProgram(db, U)).rejects.toThrow('active_program_exists');
  });

  it('logs offline, refuses locked sessions, completes and unlocks next calendar day', async () => {
    const { ses: ses2 } = await sessionExercises(2);
    await expect(saveSet(db, U, { sessionExerciseId: ses2[0].id, setIndex: 0, patch: { reps: 10, done: true } })).rejects.toThrow(LocalRuleError);

    const { s: s1, ses } = await sessionExercises(1);
    await saveSet(db, U, { sessionExerciseId: ses[0].id, setIndex: 0, patch: { weight_kg: 40 } }, at('2026-11-10T04:00:00Z'));
    expect(await statusOf()).toEqual(['in_progress', 'locked', 'locked']);
    await expect(completeSession(db, U, s1.id, at('2026-11-10T05:00:00Z'))).rejects.toThrow('incomplete');

    await doAllSets(1, at('2026-11-10T05:00:00Z'));
    await completeSession(db, U, s1.id, at('2026-11-10T06:00:00Z'));
    expect(await statusOf()).toEqual(['complete', 'locked', 'locked']);
    const rpc = (await db.outbox.toArray()).find((o) => o.payload.kind === 'rpc' && o.payload.fn === 'complete_session')!;
    expect(rpc.payload).toEqual({ kind: 'rpc', fn: 'complete_session', args: { session_id: s1.id, client_completed_at: '2026-11-10T06:00:00.000Z' } });

    await refreshProgress(db, U, at('2026-11-10T18:00:00Z')); // 23:30 IST
    expect(await statusOf()).toEqual(['complete', 'locked', 'locked']);
    await refreshProgress(db, U, at('2026-11-10T19:00:00Z')); // 00:30 IST next day
    expect(await statusOf()).toEqual(['complete', 'up_next', 'locked']);
  });

  it('concurrent saves to the same set keep every field (blur then tick)', async () => {
    const { ses } = await sessionExercises(1);
    const target = { sessionExerciseId: ses[0].id, setIndex: 0 };
    await Promise.all([
      saveSet(db, U, { ...target, patch: { weight_kg: 40 } }),
      saveSet(db, U, { ...target, patch: { reps: 9 } }),
      saveSet(db, U, { ...target, patch: { done: true } }),
    ]);
    const logs = await db.set_logs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ weight_kg: 40, reps: 9, done: true });
  });

  it('one set row per (exercise, index): edits coalesce into one queued upsert', async () => {
    const { ses } = await sessionExercises(1);
    await saveSet(db, U, { sessionExerciseId: ses[0].id, setIndex: 0, patch: { weight_kg: 40 } });
    await saveSet(db, U, { sessionExerciseId: ses[0].id, setIndex: 0, patch: { reps: 9, done: true } });
    const logs = await db.set_logs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ weight_kg: 40, reps: 9, done: true, source: 'app' });
    expect(logs[0].logged_at).not.toBeNull();
    const setOps = (await db.outbox.toArray()).filter((o) => o.key?.startsWith('set_logs:'));
    expect(setOps).toHaveLength(1);
  });

  it('complete session: typo edits allowed, untick refused', async () => {
    const s1 = await doAllSets(1, at('2026-11-10T05:00:00Z'));
    await completeSession(db, U, s1.id, at('2026-11-10T06:00:00Z'));
    const { ses } = await sessionExercises(1);
    await saveSet(db, U, { sessionExerciseId: ses[0].id, setIndex: 0, patch: { reps: 8 } }, at('2026-11-10T07:00:00Z'));
    await expect(saveSet(db, U, { sessionExerciseId: ses[0].id, setIndex: 0, patch: { done: false } })).rejects.toThrow('cannot_untick');
    await expect(saveSet(db, U, { sessionExerciseId: ses[0].id, setIndex: 7, patch: { reps: 8, done: true } })).rejects.toThrow('session_complete');
  });

  it('swaps within the swap group on the current session only', async () => {
    const { ses } = await sessionExercises(1);
    await swapExercise(db, ses[0].id, 'db-bench');
    expect((await db.session_exercises.get(ses[0].id))!.exercise_id).toBe('db-bench');
    await expect(swapExercise(db, ses[0].id, 'squat')).rejects.toThrow('swap_not_allowed');
    const { ses: ses2 } = await sessionExercises(2);
    await expect(swapExercise(db, ses2[0].id, 'goblet-squat')).rejects.toThrow('swap_not_allowed');
  });

  it('session field edits merge into one patch', async () => {
    const { s } = await sessionExercises(1);
    await updateSessionFields(db, s.id, { notes: 'felt good' });
    await updateSessionFields(db, s.id, { cardio_done: true });
    const ops = (await db.outbox.toArray()).filter((o) => o.key === `session:${s.id}`);
    expect(ops).toHaveLength(1);
    expect(ops[0].payload).toMatchObject({ kind: 'update', patch: { notes: 'felt good', cardio_done: true } });
  });

  it('lastWeightFor picks the most recent done weight outside the session', async () => {
    const s1 = await doAllSets(1, at('2026-11-10T05:00:00Z'), 42.5);
    expect(await lastWeightFor(db, 'bench')).toBe(42.5);
    expect(await lastWeightFor(db, 'bench', s1.id)).toBeNull();
  });

  it('syncNow flushes in order then pulls server truth (server status wins)', async () => {
    const s1 = await doAllSets(1, at('2026-11-10T05:00:00Z'));
    await completeSession(db, U, s1.id, at('2026-11-10T06:00:00Z'));
    const serverSessions = (await db.program_sessions.toArray()).map((s) => (s.seq === 1 ? { ...s, status: 'in_progress', completed_at: null } : s));
    const { client, calls } = fakeSupabase({ tables: { program_sessions: serverSessions } });
    const r = await syncNow(db, client, U);
    expect(r.pulled).toBe(true);
    const writes = calls.filter((c) => c.kind !== 'select');
    // settings, program, sessions, exercises..., sets..., complete_session, then refresh_unlocks from pull
    expect(writes[0]).toMatchObject({ kind: 'upsert', table: 'user_settings' });
    const rpcIdx = writes.findIndex((c) => c.fn === 'complete_session');
    const lastSet = writes.map((c) => c.table).lastIndexOf('set_logs');
    expect(rpcIdx).toBeGreaterThan(lastSet);
    expect(writes[writes.length - 1]).toMatchObject({ kind: 'rpc', fn: 'refresh_unlocks' });
    // server said s1 is still in progress (e.g. it rejected completion) → local follows
    expect((await db.program_sessions.get(s1.id))!.status).toBe('in_progress');
  });
});

describe('mergeSetLog', () => {
  const base: SetLog = {
    id: 'a', session_exercise_id: 'se', session_id: 's', user_id: U, set_index: 0, weight_kg: 40, reps: 10, seconds: null, rpe: null,
    done: true, source: 'app', garmin_activity_id: null, logged_at: null, created_at: '2026-11-10T05:00:00Z', updated_at: '2026-11-10T05:00:00Z',
  };
  it('last write wins by updated_at', () => {
    expect(mergeSetLog(base, { ...base, reps: 8, updated_at: '2026-11-10T06:00:00Z' })!.reps).toBe(8);
    expect(mergeSetLog({ ...base, reps: 12, updated_at: '2026-11-10T07:00:00Z' }, { ...base, reps: 8, updated_at: '2026-11-10T06:00:00Z' })!.reps).toBe(12);
  });
  it('watch data only fills empty fields', () => {
    const local = { ...base, weight_kg: null };
    const watch = { ...base, id: 'w', weight_kg: 50, reps: 12, source: 'watch' as const, garmin_activity_id: '9', updated_at: '2026-11-10T08:00:00Z' };
    const m = mergeSetLog(local, watch)!;
    expect(m).toMatchObject({ id: 'w', weight_kg: 50, reps: 10, source: 'app', garmin_activity_id: '9' });
  });
  it('watch fills an empty app row entirely', () => {
    const empty = { ...base, weight_kg: null, reps: null, done: false };
    const watch = { ...base, weight_kg: 50, reps: 12, source: 'watch' as const, updated_at: '2026-11-10T08:00:00Z' };
    expect(mergeSetLog(empty, watch)).toMatchObject({ weight_kg: 50, reps: 12, done: true, source: 'watch' });
  });
});

describe('local actions (more)', () => {
  it('immediate rule unlocks right away; a rule change re-evaluates', async () => {
    const s1 = await doAllSets(1, at('2026-11-10T05:00:00Z'));
    await completeSession(db, U, s1.id, at('2026-11-10T06:00:00Z'));
    expect(await statusOf()).toEqual(['complete', 'locked', 'locked']);
    await updateSettings(db, U, { unlock_rule: 'immediate' }, at('2026-11-10T06:01:00Z'));
    expect(await statusOf()).toEqual(['complete', 'up_next', 'locked']);
  });

  it('body weight upserts per date (one queued op per day)', async () => {
    await saveBodyWeight(db, U, '2026-11-10', 80.4);
    await saveBodyWeight(db, U, '2026-11-10', 80.2);
    expect((await db.body_weights.get([U, '2026-11-10']))!.kg).toBe(80.2);
    expect((await db.outbox.toArray()).filter((o) => o.key === 'body_weights:2026-11-10')).toHaveLength(1);
  });

  it('does not pull while ops are still pending (offline)', async () => {
    const { client, calls } = fakeSupabase({ respond: () => ({ error: { message: 'offline' }, status: 0 }) });
    const r = await syncNow(db, client, U);
    expect(r).toMatchObject({ blocked: true, pulled: false });
    expect(calls.some((c) => c.kind === 'select')).toBe(false);
  });

  it('logging needs Start: typing into an up-next session is refused', async () => {
    const s1 = (await db.program_sessions.where('[program_id+seq]').equals([PID, 1]).first())!;
    expect(s1.status).toBe('up_next');
    const se = (await db.session_exercises.where('session_id').equals(s1.id).first())!;
    await expect(saveSet(db, U, { sessionExerciseId: se.id, setIndex: 0, patch: { weight_kg: 40 } })).rejects.toThrow('not_started');
    expect(await db.set_logs.count()).toBe(0);
    expect((await db.program_sessions.get(s1.id))!.status).toBe('up_next');
  });

  it('reset undoes an accidental start: sets and their unsent writes are dropped, server reset queued', async () => {
    const { s, ses } = await sessionExercises(1);
    await saveSet(db, U, { sessionExerciseId: ses[0].id, setIndex: 0, patch: { weight_kg: 40, reps: 8, done: true } });
    await saveSet(db, U, { sessionExerciseId: ses[1].id, setIndex: 0, patch: { weight_kg: 10 } });
    expect(await db.set_logs.count()).toBe(2);

    await resetSession(db, U, s.id);
    const after = (await db.program_sessions.get(s.id))!;
    expect(after.status).toBe('up_next');
    expect(after.started_at).toBeNull();
    expect(await db.set_logs.count()).toBe(0);
    const ops = (await db.outbox.toArray()).filter((o) => o.status === 'pending');
    expect(ops.some((o) => o.key?.startsWith('set_logs:'))).toBe(false);
    const fns = ops.filter((o) => o.payload.kind === 'rpc').map((o) => (o.payload as { fn: string }).fn);
    expect(fns.slice(-2)).toEqual(['start_session', 'reset_session']);

    // Start again works after a reset.
    await startSession(db, U, s.id);
    expect((await db.program_sessions.get(s.id))!.status).toBe('in_progress');
  });

  it('reset refuses a completed session', async () => {
    const s = await doAllSets(1, at('2026-11-10T05:00:00Z'));
    await completeSession(db, U, s.id, at('2026-11-10T06:00:00Z'));
    await expect(resetSession(db, U, s.id)).rejects.toThrow('session_complete');
    expect(await db.set_logs.count()).toBeGreaterThan(0);
  });
});
