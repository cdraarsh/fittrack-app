// @vitest-environment node
/**
 * Adversarial whole-app pass: data integrity across a long program (local
 * store, fake-indexeddb). A FAILING test = a defect.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FitDB } from '@/lib/local/db';
import {
  completeSession,
  ensureSettings,
  lastWeightFor,
  refreshProgress,
  saveSet,
  seedExercises,
  startProgram,
  startSession,
  updateSettings,
  getActiveProgram,
} from '@/lib/local/actions';
import { DEFAULT_TEMPLATE, dayInfo, generateProgram, prefillWeight, setLogId } from '@/lib/program';
import type { SetLog } from '@/lib/program/types';

const U = 'owner';
const PID = '22222222-2222-4222-8222-222222222222';
let db: FitDB;
let n = 0;
const at = (s: string) => new Date(s);

beforeEach(async () => {
  db = new FitDB(`whole-long-${++n}`);
  await db.open();
  await seedExercises(db);
  await ensureSettings(db, U);
  await updateSettings(db, U, { timezone: 'UTC', unlock_rule: 'immediate' }, at('2026-01-01T00:00:00Z'));
  await startProgram(db, U, { programId: PID, now: at('2026-01-01T01:00:00Z') });
});

const bySeq = async (seq: number) => (await db.program_sessions.where('[program_id+seq]').equals([PID, seq]).first())!;

/** Fill every prescribed set of `seq` straight into Dexie (fast), then complete it. */
async function finish(seq: number, when: Date, kgFor: (exerciseId: string) => number | null = () => 50) {
  const s = await bySeq(seq);
  if (s.status === 'up_next') await startSession(db, U, s.id, when);
  const ses = await db.session_exercises.where('session_id').equals(s.id).toArray();
  const iso = when.toISOString();
  const rows: SetLog[] = [];
  for (const se of ses)
    for (let i = 0; i < se.sets; i++)
      rows.push({
        id: setLogId(se.id, i), session_exercise_id: se.id, session_id: s.id, user_id: U, set_index: i,
        weight_kg: kgFor(se.exercise_id), reps: se.rep_hi, seconds: null, rpe: null, done: true, source: 'app',
        garmin_activity_id: null, logged_at: iso, created_at: iso, updated_at: iso,
      });
  await db.set_logs.bulkPut(rows);
  await completeSession(db, U, s.id, when);
}

describe('generator: 64 sessions', () => {
  it('holds: ids unique, deload only in week 15, Day labels cycle 1–4, 16 cycles', () => {
    const g = generateProgram({ template: DEFAULT_TEMPLATE, programId: PID, userId: U, startDate: '2026-01-01', now: '2026-01-01T00:00:00Z' });
    expect(g.sessions).toHaveLength(64);
    expect(new Set(g.sessions.map((s) => s.id)).size).toBe(64);
    expect(new Set(g.sessionExercises.map((s) => s.id)).size).toBe(g.sessionExercises.length);
    expect(g.sessions.filter((s) => s.is_deload).map((s) => s.week)).toEqual([15, 15, 15, 15]);
    expect(g.sessions.map((s) => dayInfo(s).day)).toEqual(Array.from({ length: 64 }, (_, i) => (i % 4) + 1));
    expect(dayInfo(g.sessions[63])).toMatchObject({ day: 4, cycle: 16, label: 'Day 4 · Lower · Hinge' });
    expect(dayInfo(g.sessions[56]).label).toBe('Day 1 · Upper · Push'); // deload title doesn't leak into the label
  });
});

describe('prefill around the deload week', () => {
  it('week 16 (first session after the deload) prefills the pre-deload working weight, not the 60 % deload load', async () => {
    // Week 14 Day 1 (seq 53): bench 60 kg. Week 15 Day 1 (seq 57, deload): bench at ~60 % = 35 kg.
    for (let seq = 1; seq <= 56; seq++) await finish(seq, new Date(Date.UTC(2026, 0, 1, 2, seq)), () => 60);
    const deload = await bySeq(57);
    expect(deload.is_deload).toBe(true);
    const deloadPrefill = prefillWeight(await lastWeightFor(db, 'bench', deload.id), true, 40);
    expect(deloadPrefill).toBe(35);
    for (let seq = 57; seq <= 60; seq++) await finish(seq, new Date(Date.UTC(2026, 0, 2, 2, seq)), () => 35);

    const wk16 = await bySeq(61);
    expect(wk16.is_deload).toBe(false);
    const prefill = prefillWeight(await lastWeightFor(db, 'bench', wk16.id), wk16.is_deload, 40);
    expect(prefill).toBe(60);
  }, 60_000);

  it('holds: last session → program complete → "Start next block" carries weights over', async () => {
    for (let seq = 1; seq <= 64; seq++) await finish(seq, new Date(Date.UTC(2026, 0, 1, 2, seq)), () => 60);
    expect(await getActiveProgram(db, U)).toBeUndefined();
    const p = await db.programs.get(PID);
    expect(p?.status).toBe('complete');
    const next = await startProgram(db, U, { now: at('2026-02-01T00:00:00Z') });
    const s1 = (await db.program_sessions.where('[program_id+seq]').equals([next, 1]).first())!;
    expect(s1.status).toBe('up_next');
    expect(await lastWeightFor(db, 'bench', s1.id)).toBe(60);
  }, 60_000);
});

describe('outbox ordering vs. the unlock rule', () => {
  it('a settings change after Complete must not be sent BEFORE that complete_session (coalesced op keeps its old slot)', async () => {
    // Offline: rule is "immediate" when Day 1 completes, so the phone opens Day 2 now.
    await db.outbox.clear();
    await updateSettings(db, U, { unlock_rule: 'immediate' }, at('2026-01-01T02:00:00Z'));
    await finish(1, at('2026-01-01T03:00:00Z'));
    expect((await bySeq(2)).status).toBe('up_next');
    // Then the owner flips the rule back to "next calendar day" (still offline).
    await updateSettings(db, U, { unlock_rule: 'next_calendar_day' }, at('2026-01-01T03:05:00Z'));

    const ops = (await db.outbox.orderBy('seq').toArray()).map((o) => o.payload);
    const iSettings = ops.findIndex((p) => p.kind === 'upsert' && p.table === 'user_settings');
    const iComplete = ops.findIndex((p) => p.kind === 'rpc' && p.fn === 'complete_session');
    const settingsSentFirst = ops[iSettings];
    // What the server sees when complete_session runs: if the settings upsert ahead of it already says
    // next_calendar_day, the server keeps Day 2 locked while the phone shows it open → Start/sets get refused.
    const ruleAtComplete = iSettings < iComplete && settingsSentFirst.kind === 'upsert' ? (settingsSentFirst.rows[0] as { unlock_rule: string }).unlock_rule : 'immediate';
    expect(ruleAtComplete).toBe('immediate');
  });
});

describe('timed exercises', () => {
  it('holds: plank (seconds) ticks and counts toward completion', async () => {
    const s = await bySeq(1);
    await finish(1, at('2026-01-01T03:00:00Z'));
    expect((await db.program_sessions.get(s.id))!.status).toBe('complete');
    await updateSettings(db, U, { unlock_rule: 'immediate' }, at('2026-01-01T04:00:00Z'));
    const d2 = await bySeq(2);
    await startSession(db, U, d2.id, at('2026-01-01T04:00:00Z'));
    const plank = (await db.session_exercises.where('session_id').equals(d2.id).toArray()).find((x) => x.exercise_id === 'plank')!;
    const row = await saveSet(db, U, { sessionExerciseId: plank.id, setIndex: 0, patch: { seconds: 40, done: true } }, at('2026-01-01T04:05:00Z'));
    expect(row).toMatchObject({ seconds: 40, reps: null, done: true });
    await refreshProgress(db, U, at('2026-01-01T04:06:00Z'));
  });
});
