// @vitest-environment node
/**
 * Adversarial r3: pure logic touched by 1e9de40 (parseSetValue, top-of-range
 * hint, e1RM cap) and the local store (outbox rpc barrier, lastWeightFor).
 * A FAILING test = a defect. Tests named "holds:" document what survived.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { parseSetValue } from '@/lib/program/inputs';
import { hitTopOfRange, topOfRangeHint } from '@/lib/program/completion';
import { liftProgress } from '@/lib/strength/lifts';
import { FitDB } from '@/lib/local/db';
import {
  completeSession,
  ensureSettings,
  lastWeightFor,
  saveSet,
  seedExercises,
  startProgram,
  startSession,
  updateSessionFields,
  updateSettings,
} from '@/lib/local/actions';
import { flush } from '@/lib/local/outbox';
import { fakeSupabase } from '../../local/fakeSupabase';

describe('parseSetValue', () => {
  it('a comma decimal ("42,5" from a comma-locale keyboard) is not silently saved as 42', () => {
    expect(parseSetValue('42,5', 'weight_kg')).toBe(42.5);
  });
  it('"1e3" in the reps field is not silently saved as 1 rep', () => {
    expect(parseSetValue('1e3', 'reps')).not.toBe(1);
  });
  it('holds: "+5" → 5, "-5" → null, over-limit clamps', () => {
    expect(parseSetValue('+5', 'weight_kg')).toBe(5);
    expect(parseSetValue('-5', 'weight_kg')).toBeNull();
    expect(parseSetValue('2000', 'weight_kg')).toBe(999.75);
    expect(parseSetValue('40000', 'seconds')).toBe(36000);
  });
});

describe('top-of-range hint', () => {
  const se = { id: 'se', sets: 3, rep_hi: 12 };
  const log = (i: number, reps: number | null, kg: number | null, seconds: number | null = null) => ({
    session_exercise_id: 'se', set_index: i, done: true, reps, seconds, weight_kg: kg,
  });

  it('one weighted set + two bodyweight sets does not earn "+2.5 kg"', () => {
    const logs = [log(0, 12, 2.5), log(1, 12, null), log(2, 12, null)];
    expect(hitTopOfRange(se, logs, false)).toBe(false);
  });

  it('a weight on an extra (non-prescribed) set does not turn bodyweight work into "+2.5 kg"', () => {
    const logs = [log(0, 12, null), log(1, 12, null), log(2, 12, null), log(3, 8, 10)];
    expect(hitTopOfRange(se, logs, false)).toBe(false);
  });

  it('swap Hanging Knee Raise (12–15 reps) → L-Sit Hold (timed, 15–30 s): 15 s holds are not "the top"', () => {
    // swapExercise keeps the prescribed rep_lo/rep_hi; ExerciseBlock passes timed from the swapped-in exercise.
    // ExerciseBlock now passes the swapped-in exercise's own range (L-Sit Hold 15–30 s) for a reps↔seconds swap.
    const lSitRange = { id: 'se', sets: 3, rep_hi: 30 };
    const logs = [0, 1, 2].map((i) => log(i, null, null, 15));
    expect(topOfRangeHint(lSitRange, logs, true)).toBeNull();
    expect(topOfRangeHint(lSitRange, [0, 1, 2].map((i) => log(i, null, null, 30)), true)).toMatch(/30 s/);
  });

  it('holds: timed never says "+2.5 kg"; loaded reps do', () => {
    expect(topOfRangeHint({ id: 'se', sets: 1, rep_hi: 45 }, [log(0, null, null, 45)], true)).toMatch(/add 5–10 s/);
    expect(topOfRangeHint(se, [0, 1, 2].map((i) => log(i, 12, 20)), false)).toMatch(/2\.5 kg/);
  });
});

describe('e1RM cap at 12 reps (Strength page)', () => {
  const base = {
    exercises: [{ id: 'curl', name: 'Curl' }],
    sessions: [1, 2, 3].map((n) => ({ id: `s${n}`, seq: n, template_key: 'k', completed_at: `2026-11-0${n + 1}T10:00:00Z`, started_at: null })),
    sessionExercises: [1, 2, 3].map((n) => ({ id: `se${n}`, session_id: `s${n}`, exercise_id: 'curl' })),
  };
  it('adding reps at the same load past 12 (12 → 15 → 20 @ 15 kg) still shows progress', () => {
    const logs = [12, 15, 20].map((reps, i) => ({
      session_exercise_id: `se${i + 1}`, weight_kg: 15, reps, seconds: null, done: true, logged_at: null, updated_at: `2026-11-0${i + 2}T10:00:00Z`,
    }));
    const [p] = liftProgress({ ...base, logs }, '2026-11-10');
    expect(p.change28).toBeGreaterThan(0); // flat 0: the trend line hides double progression
  });
});

// ─── Local store ──────────────────────────────────────────────────────────────
const U = 'owner';
const PID = '33333333-3333-4333-8333-333333333333';
let db: FitDB;
let n = 0;
beforeEach(async () => {
  db = new FitDB(`adv-r3-${++n}`);
  await db.open();
  await seedExercises(db);
  await ensureSettings(db, U);
  await updateSettings(db, U, { timezone: 'UTC', unlock_rule: 'immediate' }, new Date('2026-11-10T00:00:00Z'));
  await startProgram(db, U, { programId: PID, now: new Date('2026-11-10T03:00:00Z') });
});
const sessionBySeq = async (seq: number) => (await db.program_sessions.where('[program_id+seq]').equals([PID, seq]).first())!;
const exercisesOf = async (sid: string) => (await db.session_exercises.where('session_id').equals(sid).toArray()).sort((a, b) => a.position - b.position);
async function doAll(sid: string, kg: number, t: Date) {
  await startSession(db, U, sid, t);
  for (const se of await exercisesOf(sid)) for (let i = 0; i < se.sets; i++) await saveSet(db, U, { sessionExerciseId: se.id, setIndex: i, patch: { done: true, reps: 10, seconds: 30, weight_kg: kg } }, t);
}

describe('outbox rpc barrier', () => {
  it('holds: 200 typo edits after Complete add one op, not 200', async () => {
    const s1 = await sessionBySeq(1);
    await doAll(s1.id, 40, new Date('2026-11-10T05:00:00Z'));
    await completeSession(db, U, s1.id, new Date('2026-11-10T06:00:00Z'));
    const before = await db.outbox.count();
    const se = (await exercisesOf(s1.id))[0];
    for (let i = 0; i < 200; i++) await saveSet(db, U, { sessionExerciseId: se.id, setIndex: 0, patch: { weight_kg: 40 + (i % 5) } }, new Date(Date.UTC(2026, 10, 10, 7, 0, i)));
    expect((await db.outbox.count()) - before).toBe(1);
  });

  it('holds: session notes edited before and after Complete reach the server in cause→effect order with every field', async () => {
    const s1 = await sessionBySeq(1);
    await doAll(s1.id, 40, new Date('2026-11-10T05:00:00Z'));
    await updateSessionFields(db, s1.id, { notes: 'a' }, new Date('2026-11-10T05:30:00Z'));
    await completeSession(db, U, s1.id, new Date('2026-11-10T06:00:00Z'));
    await updateSessionFields(db, s1.id, { cardio_done: true }, new Date('2026-11-10T06:01:00Z'));
    await updateSessionFields(db, s1.id, { notes: 'b' }, new Date('2026-11-10T06:02:00Z'));
    const ops = (await db.outbox.orderBy('seq').toArray()).map((o) => o.payload);
    const iRpc = ops.findIndex((p) => p.kind === 'rpc' && p.fn === 'complete_session');
    const sessionOps = ops.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'update' && p.table === 'program_sessions');
    expect(sessionOps).toHaveLength(2);
    expect(sessionOps[0].i).toBeLessThan(iRpc);
    expect(sessionOps[1].i).toBeGreaterThan(iRpc);
    expect((sessionOps[1].p as { patch: object }).patch).toMatchObject({ notes: 'b', cardio_done: true });
    const { client, calls } = fakeSupabase();
    await flush(db, client);
    expect(calls.length).toBeGreaterThan(0);
    expect(await db.outbox.filter((o) => o.status === 'pending').count()).toBe(0);
  });
});

describe('lastWeightFor skips deloads', () => {
  it('holds: the week after a deload prefills the pre-deload working weight, and a cold deload uses the (already reduced) target', async () => {
    const all = await db.program_sessions.where('program_id').equals(PID).sortBy('seq');
    const firstDeload = all.find((s) => s.is_deload)!;
    expect(firstDeload).toBeTruthy();
    // Nothing logged yet: no history → null (prefill falls back to target_kg, which generate already scales).
    const se = (await exercisesOf(firstDeload.id))[0];
    expect(await lastWeightFor(db, se.exercise_id, firstDeload.id)).toBeNull();
  });

  it('holds: 64 sessions × 6 exercises answer in well under a frame budget per exercise', async () => {
    const all = await db.program_sessions.where('program_id').equals(PID).sortBy('seq');
    let t = Date.UTC(2026, 10, 10, 5);
    for (const s of all.slice(0, 20)) {
      await doAll(s.id, s.is_deload ? 24 : 40, new Date(t));
      await completeSession(db, U, s.id, new Date(t + 3600_000));
      t += 86_400_000;
    }
    const se = (await exercisesOf(all[20].id))[0];
    const t0 = performance.now();
    const w = await lastWeightFor(db, se.exercise_id, all[20].id);
    const ms = performance.now() - t0;
    expect(w).toBe(40);
    expect(ms).toBeLessThan(250);
  });
});
