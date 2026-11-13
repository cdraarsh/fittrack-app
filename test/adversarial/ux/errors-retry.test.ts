/**
 * Adversarial (UX commit a43fbc3): lib/ui/errors.ts classification and the
 * Settings "Retry" button (failed -> pending, attempts 0). A FAILING test = defect.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { humanizeError, refusalReason, UNREACHABLE } from '@/lib/ui/errors';
import { classifyError } from '@/lib/local/outbox';
import { FitDB } from '@/lib/local/db';
import { ensureSettings, resetSession, saveSet, seedExercises, startProgram, startSession } from '@/lib/local/actions';

describe('adversarial: humanizeError / refusalReason', () => {
  it('holds: browser network failures read as unreachable', () => {
    for (const m of ['TypeError: Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', '0 TypeError: Failed to fetch']) {
      expect(humanizeError(m)).toBe(UNREACHABLE);
    }
  });

  it('holds: guard refusals map to their reason', () => {
    expect(refusalReason('P0001 session_locked')).toMatch(/still locked/);
    expect(refusalReason('P0001 not_started')).toMatch(/hadn’t been started/);
    expect(refusalReason('P0001 cannot_untick_completed_set')).toMatch(/can’t be unticked/);
  });

  // Settings / header only show status.lastError when the flush was *blocked*,
  // i.e. classifyError said 'retry' and the op is still pending. These are
  // transient, nothing was refused.
  it('BUG: a transient (retry) JWT error is shown as "The server refused a change"', () => {
    expect(classifyError({ message: 'JWT expired', code: 'PGRST301', status: 401 })).toBe('retry');
    expect(humanizeError('JWT expired')).not.toMatch(/refused/);
  });

  it('BUG: a transient 503 / 429 is shown as "The server refused a change"', () => {
    expect(classifyError({ message: 'Service Unavailable', status: 503 })).toBe('retry');
    expect(humanizeError('Service Unavailable')).not.toMatch(/refused/);
    expect(classifyError({ message: 'Too Many Requests', status: 429 })).toBe('retry');
    expect(humanizeError('Too Many Requests')).not.toMatch(/refused/);
  });

  it('BUG: a transient FK wait (23503, retried) is shown as a refusal', () => {
    const msg = 'insert or update on table "set_logs" violates foreign key constraint "set_logs_session_exercise_id_fkey"';
    expect(classifyError({ message: msg, code: '23503', status: 409 })).toBe('retry');
    // lastError for a blocked flush is err.message only (no code), so it falls through to the generic text.
    expect(humanizeError(msg)).not.toMatch(/refused/);
  });

  it('BUG: a server-side failure whose text says "aborted" reads as "couldn’t be reached"', () => {
    // 25P02 parked after MAX_ATTEMPTS: last_error = "25P02 current transaction is aborted, ..."
    expect(refusalReason('25P02 current transaction is aborted, commands ignored until end of transaction block')).not.toMatch(/couldn’t be reached/);
  });
});

describe('adversarial: Settings Retry (failed -> pending)', () => {
  it('BUG: Retry replays a failed set from a run that was since reset, into the restarted run', async () => {
    const db = new FitDB(`retry-${Math.random()}`);
    await db.open();
    const U = 'retry_user';
    await seedExercises(db);
    await ensureSettings(db, U);
    await startProgram(db, U, { programId: '55555555-5555-4555-8555-555555555555', now: new Date('2026-11-10T03:00:00Z') });
    const s = (await db.program_sessions.where('[program_id+seq]').equals(['55555555-5555-4555-8555-555555555555', 1]).first())!;
    const se = (await db.session_exercises.where('session_id').equals(s.id).first())!;
    await startSession(db, U, s.id);
    await saveSet(db, U, { sessionExerciseId: se.id, setIndex: 0, patch: { weight_kg: 100, reps: 5, done: true } });
    // The server refused it (e.g. parked after a refusal) -> status failed.
    await db.outbox.toCollection().modify((o) => {
      if (o.payload.kind === 'upsert' && o.payload.table === 'set_logs') {
        o.status = 'failed';
        o.last_error = 'P0001 not_started';
      }
    });
    // Accidental start: Reset (drops only *pending* set ops), then a fresh Start.
    await resetSession(db, U, s.id);
    await startSession(db, U, s.id);
    expect(await db.set_logs.where('session_id').equals(s.id).count()).toBe(0);
    // Settings -> Retry does exactly this:
    await db.outbox.where('status').equals('failed').modify({ status: 'pending', attempts: 0 });
    const pendingSetOps = (await db.outbox.toArray()).filter((o) => o.status === 'pending' && o.payload.kind === 'upsert' && o.payload.table === 'set_logs');
    // A discarded set (100 kg x 5, done) is about to be upserted into the new run on the server.
    expect(pendingSetOps).toHaveLength(0);
  });
});
