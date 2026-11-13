/**
 * Adversarial (UX commit a43fbc3): local "Finish later" pause.
 * A FAILING test = defect.
 */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { getDb } from '@/lib/local/db';
import { ensureSettings, resetSession, seedExercises, startProgram, startSession } from '@/lib/local/actions';
import { activeMs, effectivePause, isPaused, pauseKey, pauseSession, type PauseState } from '@/lib/local/pause';
import SessionLogger from '@/components/workout/SessionLogger';

vi.mock('@/components/workout/sound', () => ({
  sound: new Proxy({}, { get: () => () => undefined }),
  useWakeLock: () => undefined,
}));

const U = 'pause_user';
const PID = '44444444-4444-4444-8444-444444444444';
let sid = '';

beforeAll(async () => {
  const db = getDb();
  await db.open();
  await seedExercises(db);
  await ensureSettings(db, U);
  await startProgram(db, U, { programId: PID, now: new Date('2026-11-10T03:00:00Z') });
  sid = (await db.program_sessions.where('[program_id+seq]').equals([PID, 1]).first())!.id;
});

describe('adversarial: pause', () => {
  it('holds: Finish later pauses, and ticking a set while paused resumes', async () => {
    const db = getDb();
    await startSession(db, U, sid, new Date());
    render(<SessionLogger sessionId={sid} userId={U} />);
    const stopBtn = await screen.findByRole('button', { name: /^Stop$/ });
    act(() => fireEvent.click(stopBtn));
    const finishLater = await screen.findByRole('button', { name: /Finish later/ });
    await act(async () => {
      fireEvent.click(finishLater);
    });
    await screen.findByRole('button', { name: /^Resume$/ });
    expect(isPaused((await db.meta.get(pauseKey(sid)))!.value as PauseState)).toBe(true);
    const reps = (await screen.findAllByLabelText(/ set 1 reps$/))[0] as HTMLInputElement;
    fireEvent.change(reps, { target: { value: '8' } });
    const tick = screen.getAllByRole('button', { name: /^Tick .+ set 1$/ })[0];
    await act(async () => {
      fireEvent.click(tick);
    });
    await waitFor(async () => expect(isPaused((await db.meta.get(pauseKey(sid)))!.value as PauseState)).toBe(false));
    await resetSession(db, U, sid);
    await db.meta.delete(pauseKey(sid));
  });

  it('BUG: a pause record survives a reset that did not go through the Logger (pull / other device / action layer); the next Start opens already "Paused" with the old active time', async () => {
    const db = getDb();
    const t0 = new Date(Date.now() - 3 * 3600_000);
    await startSession(db, U, sid, t0);
    const s = (await db.program_sessions.get(sid))!;
    await pauseSession(db, sid, s.started_at, new Date(t0.getTime() + 40 * 60_000)); // 40 min, then "Finish later"
    // Reset arrives without the Logger: server row wins on pull, or resetSession from the action layer.
    await resetSession(db, U, sid);
    expect((await db.program_sessions.get(sid))!.status).toBe('up_next');
    // Days later the user taps Start on a fresh run.
    await startSession(db, U, sid, new Date());
    render(<SessionLogger sessionId={sid} userId={U} />);
    await screen.findByRole('timer', { name: 'Session time' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150)); // let the pause liveQuery land
    });
    // A just-started session must be running, not paused at 40:00.
    expect(screen.queryByRole('button', { name: /^Resume$/ })).toBeNull();
    expect(screen.getByRole('timer', { name: 'Session time' }).textContent).not.toBe('40:00');
    await resetSession(db, U, sid);
    await db.meta.delete(pauseKey(sid));
  });

  it('BUG (by state): an in_progress session with no started_at and no pause record reads as paused', () => {
    // effectivePause(undefined, null) => resumedAt null => isPaused === true, so Today says "— paused",
    // the coach is told "paused" and the wake lock is off although the user never paused.
    expect(isPaused(effectivePause(undefined, null))).toBe(false);
  });

  it('holds: future resumedAt, NaN activeMs and garbage never produce NaN or negative time', () => {
    const now = Date.now();
    expect(activeMs({ activeMs: 5000, resumedAt: new Date(now + 3600_000).toISOString() }, now)).toBe(5000);
    expect(activeMs({ activeMs: NaN, resumedAt: null }, now)).toBe(0);
    expect(activeMs({ activeMs: -10, resumedAt: null }, now)).toBe(0);
    expect(activeMs({ activeMs: Infinity, resumedAt: null }, now)).toBe(0);
  });
});
