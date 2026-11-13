/** Adversarial: SessionLogger Start / SessionBar / StopSheet in jsdom. A FAILING test = defect. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { getDb } from '@/lib/local/db';
import { ensureSettings, seedExercises, startProgram, startSession } from '@/lib/local/actions';
import SessionLogger from '@/components/workout/SessionLogger';

vi.mock('@/components/workout/sound', () => ({
  sound: new Proxy({}, { get: () => () => undefined }),
  useWakeLock: () => undefined,
}));

const U = 'ui_user';
const PID = '33333333-3333-4333-8333-333333333333';
let sid = '';

beforeAll(async () => {
  const db = getDb();
  await db.open();
  await seedExercises(db);
  await ensureSettings(db, U);
  await startProgram(db, U, { programId: PID, now: new Date('2026-11-10T03:00:00Z') });
  sid = (await db.program_sessions.where('[program_id+seq]').equals([PID, 1]).first())!.id;
});

describe('adversarial: session logger UI', () => {
  it('holds: an up_next session shows Start and no set inputs, notes, swap or enabled cardio', async () => {
    render(<SessionLogger sessionId={sid} userId={U} />);
    await screen.findByRole('button', { name: /Start Day 1/ });
    expect(screen.queryByLabelText(/ set 1 weight$/i)).toBeNull();
    expect(screen.queryByLabelText('Session notes')).toBeNull();
    expect(screen.queryByLabelText('Swap exercise')).toBeNull();
    const cardio = screen.queryByLabelText('Cardio done') as HTMLInputElement | null;
    if (cardio) expect(cardio.disabled).toBe(true);
  });

  it('SessionBar with an unparsable started_at shows a sane time, not NaN', async () => {
    const db = getDb();
    await startSession(db, U, sid, new Date());
    const s = (await db.program_sessions.get(sid))!;
    await db.program_sessions.put({ ...s, started_at: 'not-a-date' });
    render(<SessionLogger sessionId={sid} userId={U} />);
    const timer = await screen.findByRole('timer');
    expect(timer.textContent).not.toMatch(/NaN/);
    await db.program_sessions.put({ ...s }); // restore
  });

  it('StopSheet: focus moves into the dialog and Escape closes it', async () => {
    render(<SessionLogger sessionId={sid} userId={U} />);
    const stop = await screen.findByRole('button', { name: /Stop/ });
    stop.focus();
    act(() => fireEvent.click(stop));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 300 });
  });
});
