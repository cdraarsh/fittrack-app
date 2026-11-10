// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FitDB } from '@/lib/local/db';
import { completeSession, ensureSettings, LocalRuleError, refreshProgress, saveSet, seedExercises, startProgram, swapExercise, updateSettings, lastWeightFor, saveBodyWeight, updateSessionFields } from '@/lib/local/actions';
import { mergeSetLog } from '@/lib/local/merge';
import { pull, syncNow } from '@/lib/local/sync';
import type { SetLog } from '@/lib/program/types';
import { fakeSupabase } from './fakeSupabase';

const U = 'user_1';
const PID = '11111111-1111-4111-8111-111111111111';
const at = (s: string) => new Date(s);
let db: FitDB;
let n = 0;

beforeEach(async () => {
  db = new FitDB(`test-actions-${++n}`);
  await db.open();
  await seedExercises(db);
  await ensureSettings(db, U);
  await updateSettings(db, U, { timezone: 'Asia/Kolkata', unlock_rule: 'next_calendar_day' }, at('2026-11-10T03:00:00Z'));
  await startProgram(db, U, { programId: PID, now: at('2026-11-10T03:00:00Z') });
});

async function sessionBySeq(seq: number) {
  return (await db.program_sessions.where('[program_id+seq]').equals([PID, seq]).first())!;
}
async function doWholeSession(seq: number, now: Date) {
  const s = await sessionBySeq(seq);
  const ses = await db.session_exercises.where('session_id').equals(s.id).toArray();
  for (const se of ses) for (let i = 0; i < se.sets; i++) await saveSet(db, U, { sessionExerciseId: se.id, setIndex: i, patch: { weight_kg: 20, reps: se.rep_hi, done: true } }, now);
  return s;
}

describe('local actions', () => {
  it('startProgram creates 64 sessions and queues settings + structural upserts', async () => {
    expect(await db.program_sessions.count()).toBe(64);
    const ops = await db.outbox.orderBy('seq').toArray();
    expect(ops.map((o) => (o.payload.kind === 'upsert' ? o.payload.table : o.payload.kind))).toEqual([
      'user_settings', 'programs', 'program_sessions', 'session_exercises', 'session_exercises',
    ]);
    expect(ops.slice(1).every((o) => o.payload.kind === 'upsert' && o.payload.ignoreDuplicates)).toBe(true);
    await expect(startProgram(db, U)).rejects.toThrow(LocalRuleError);
  });

  it('logging the first set starts the session; future sessions refuse writes', async () => {
    const s2 = await sessionBySeq(2);
    const se2 = (await db.session_exercises.where('session_id').equals(s2.id).first())!;
    await expect(saveSet(db, U, { sessionExerciseId: se2.id, setIndex: 0, patch: { reps: 10 } })).rejects.toMatchObject({ code: 'locked' });

    const s1 = await sessionBySeq(1);
    const se1 = (await db.session_exercises.where('session_id').equals(s1.id).first())!;
    const row = await saveSet(db, U, { sessionExerciseId: se1.id, setIndex: 0, patch: { weight_kg: 40, reps: 10, done: true } }, at('2026-11-10T04:00:00Z'));
    expect((await sessionBySeq(1)).status).toBe('in_progress');
    expect(row.logged_at).toBe('2026-11-10T04:00:00.000Z');
    // edits to the same set coalesce into one queued upsert with a stable id
    await saveSet(db, U, { sessionExerciseId: se1.id, setIndex: 0, patch: { reps: 9 } });
    const setOps = (await db.outbox.toArray()).filter((o) => o.key === `set_logs:${row.id}`);
    expect(setOps).toHaveLength(1);
    expect((setOps[0].payload as { rows: SetLog[] }).rows[0].reps).toBe(9);
  });

  it('cannot complete with missing sets; completes when done; next unlocks next local day', async () => {
    const s1 = await sessionBySeq(1);
    await expect(completeSession(db, U, s1.id, at('2026-11-10T05:00:00Z'))).rejects.toMatchObject({ code: 'incomplete' });
    await doWholeSession(1, at('2026-11-10T05:00:00Z'));
    const r = await completeSession(db, U, s1.id, at('2026-11-10T06:00:00Z'));
    expect(r.unlocksOn).toBe('2026-11-11');
    expect((await sessionBySeq(2)).status).toBe('locked');
    const rpc = (await db.outbox.toArray()).find((o) => o.payload.kind === 'rpc')!;
    expect(rpc.payload).toEqual({ kind: 'rpc', fn: 'complete_session', args: { session_id: s1.id, client_completed_at: '2026-11-10T06:00:00.000Z' } });

    await refreshProgress(db, U, at('2026-11-10T18:00:00Z')); // 23:30 IST — still today
    expect((await sessionBySeq(2)).status).toBe('locked');
    await refreshProgress(db, U, at('2026-11-14T03:00:00Z')); // days later — delay, not skip
    expect((await sessionBySeq(2)).status).toBe('up_next');
    expect((await sessionBySeq(3)).status).toBe('locked');
  });

  it('complete session: typo edits ok, untick refused, new rows refused', async () => {
    const s1 = await doWholeSession(1, at('2026-11-10T05:00:00Z'));
    await completeSession(db, U, s1.id, at('2026-11-10T06:00:00Z'));
    const se = (await db.session_exercises.where('session_id').equals(s1.id).first())!;
    await saveSet(db, U, { sessionExerciseId: se.id, setIndex: 0, patch: { reps: 8 } });
    await expect(saveSet(db, U, { sessionExerciseId: se.id, setIndex: 0, patch: { done: false } })).rejects.toMatchObject({ code: 'cannot_untick' });
    await expect(saveSet(db, U, { sessionExerciseId: se.id, setIndex: 7, patch: { reps: 8, done: true } })).rejects.toMatchObject({ code: 'session_complete' });
  });

  it('immediate rule unlocks right away; rule change re-evaluates', async () => {
    const s1 = await doWholeSession(1, at('2026-11-10T05:00:00Z'));
    await completeSession(db, U, s1.id, at('2026-11-10T06:00:00Z'));
    await updateSettings(db, U, { unlock_rule: 'immediate' }, at('2026-11-10T06:01:00Z'));
    expect((await sessionBySeq(2)).status).toBe('up_next');
  });

  it('swaps only within the swap group on the current session', async () => {
    const s1 = await sessionBySeq(1);
    const bench = (await db.session_exercises.where('session_id').equals(s1.id).filter((x) => x.exercise_id === 'bench').first())!;
    await swapExercise(db, bench.id, 'db-bench');
    expect((await db.session_exercises.get(bench.id))!.exercise_id).toBe('db-bench');
    await expect(swapExercise(db, bench.id, 'squat')).rejects.toMatchObject({ code: 'swap_not_allowed' });
    const s5 = await sessionBySeq(5);
    const future = (await db.session_exercises.where('session_id').equals(s5.id).first())!;
    await expect(swapExercise(db, future.id, 'db-bench')).rejects.toMatchObject({ code: 'swap_not_allowed' });
  });

  it('session field edits merge into one queued patch; locked sessions refuse', async () => {
    const s1 = await sessionBySeq(1);
    await updateSessionFields(db, s1.id, { notes: 'felt good' });
    await updateSessionFields(db, s1.id, { cardio_done: true });
    const ops = (await db.outbox.toArray()).filter((o) => o.key === `session:${s1.id}`);
    expect(ops).toHaveLength(1);
    expect(ops[0].payload).toMatchObject({ kind: 'update', patch: { notes: 'felt good', cardio_done: true } });
    await expect(updateSessionFields(db, (await sessionBySeq(2)).id, { notes: 'x' })).rejects.toMatchObject({ code: 'locked' });
  });

  it('lastWeightFor returns the latest done weight from earlier sessions', async () => {
    const s1 = await doWholeSession(1, at('2026-11-10T05:00:00Z'));
    expect(await lastWeightFor(db, 'bench')).toBe(20);
    expect(await lastWeightFor(db, 'bench', s1.id)).toBeNull();
  });

  it('body weight upserts per date', async () => {
    await saveBodyWeight(db, U, '2026-11-10', 80.4);
    await saveBodyWeight(db, U, '2026-11-10', 80.2);
    expect((await db.body_weights.get([U, '2026-11-10']))!.kg).toBe(80.2);
    expect((await db.outbox.toArray()).filter((o) => o.key === 'body_weights:2026-11-10')).toHaveLength(1);
  });
});

const log = (o: Partial<SetLog>): SetLog => ({
  id: 'l1', session_exercise_id: 'se', session_id: 's', user_id: U, set_index: 0, weight_kg: null, reps: null, seconds: null, rpe: null,
  done: false, source: 'app', garmin_activity_id: null, logged_at: null, created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z', ...o,
});

describe('mergeSetLog', () => {
  it('last write wins by updated_at', () => {
    expect(mergeSetLog(log({ reps: 5, updated_at: '2026-11-10T02:00:00Z' }), log({ reps: 8, updated_at: '2026-11-10T01:00:00Z' }))!.reps).toBe(5);
    expect(mergeSetLog(log({ reps: 5, updated_at: '2026-11-10T01:00:00Z' }), log({ reps: 8, updated_at: '2026-11-10T02:00:00Z' }))!.reps).toBe(8);
  });
  it('watch data only fills empty fields', () => {
    const local = log({ reps: 10, weight_kg: null, updated_at: '2026-11-10T01:00:00Z' });
    const watch = log({ id: 'w', reps: 12, weight_kg: 50, done: true, source: 'watch', updated_at: '2026-11-10T02:00:00Z' });
    const m = mergeSetLog(local, watch)!;
    expect(m).toMatchObject({ id: 'w', reps: 10, weight_kg: 50, done: true, source: 'app' });
    expect(mergeSetLog(log({ updated_at: '2026-11-10T01:00:00Z' }), watch)!.source).toBe('watch');
  });
});

describe('sync', () => {
  it('flushes, then pulls server truth and merges set logs by (exercise, index)', async () => {
    const s1 = await sessionBySeq(1);
    const se = (await db.session_exercises.where('session_id').equals(s1.id).first())!;
    await saveSet(db, U, { sessionExerciseId: se.id, setIndex: 0, patch: { reps: 10, done: true } }, at('2026-11-10T04:00:00Z'));
    const sessions = await db.program_sessions.toArray();
    const serverSessions = sessions.map((s) => (s.seq === 1 ? { ...s, status: 'in_progress' as const } : s));
    const watchRow = log({ id: 'server-id', session_exercise_id: se.id, session_id: s1.id, set_index: 0, reps: 10, weight_kg: 45, done: true, updated_at: '2026-11-10T05:00:00Z' });
    const { client, calls } = fakeSupabase({
      tables: {
        programs: await db.programs.toArray(),
        program_sessions: serverSessions,
        session_exercises: await db.session_exercises.toArray(),
        set_logs: [watchRow],
        body_weights: [{ user_id: U, date: '2026-11-09', kg: '81.10', source: 'app', created_at: 'x', updated_at: '2026-11-09T00:00:00Z' }],
        user_settings: [],
      },
    });
    const r = await syncNow(db, client, U);
    expect(r.pulled).toBe(true);
    expect(calls.filter((c) => c.kind === 'upsert').length).toBeGreaterThanOrEqual(5);
    const rows = await db.set_logs.where('[session_exercise_id+set_index]').equals([se.id, 0]).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'server-id', weight_kg: 45 });
    expect((await db.body_weights.get([U, '2026-11-09']))!.kg).toBe(81.1);
  });

  it('does not pull while ops are still pending (offline)', async () => {
    const { client, calls } = fakeSupabase({ respond: () => ({ error: { message: 'offline' }, status: 0 }) });
    const r = await syncNow(db, client, U);
    expect(r).toMatchObject({ blocked: true, pulled: false });
    expect(calls.some((c) => c.kind === 'select')).toBe(false);
    expect(typeof pull).toBe('function');
  });
});
