import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FitDB } from '@/lib/local/db';
import { activeMs, clearPause, effectivePause, isPaused, pauseKey, pauseSession, resumeSession, type PauseState } from '@/lib/local/pause';

let db: FitDB;
beforeEach(async () => {
  db = new FitDB(`pause-${Math.random()}`);
  await db.open();
});

const t = (iso: string) => new Date(iso);

describe('Finish later pause (local only)', () => {
  it('counts active time only: 20 min, paused overnight, 10 more min = 30 min', async () => {
    const started = '2026-11-14T18:00:00Z';
    expect(activeMs(effectivePause(undefined, started), t('2026-11-14T18:20:00Z').getTime())).toBe(20 * 60_000);
    const paused = await pauseSession(db, 's1', started, t('2026-11-14T18:20:00Z'));
    expect(isPaused(paused)).toBe(true);
    expect(activeMs(paused, t('2026-11-15T09:00:00Z').getTime())).toBe(20 * 60_000); // not 15 h
    const resumed = await resumeSession(db, 's1', started, t('2026-11-15T09:00:00Z'));
    expect(activeMs(resumed, t('2026-11-15T09:10:00Z').getTime())).toBe(30 * 60_000);
  });

  it('pause and resume are idempotent; clear removes the record', async () => {
    const started = '2026-11-14T18:00:00Z';
    const a = await pauseSession(db, 's1', started, t('2026-11-14T18:05:00Z'));
    const b = await pauseSession(db, 's1', started, t('2026-11-14T18:30:00Z'));
    expect(b).toEqual(a);
    await resumeSession(db, 's1', started, t('2026-11-14T19:00:00Z'));
    const c = await resumeSession(db, 's1', started, t('2026-11-14T19:30:00Z'));
    expect(c.resumedAt).toBe('2026-11-14T19:00:00.000Z');
    await clearPause(db, 's1');
    expect(await db.meta.get(pauseKey('s1'))).toBeUndefined();
  });

  it('never NaN on bad or missing start times', () => {
    expect(activeMs(effectivePause(undefined, null), Date.now())).toBe(0);
    expect(activeMs({ activeMs: 0, resumedAt: 'garbage' } as PauseState, Date.now())).toBe(0);
    expect(activeMs(effectivePause(undefined, '2099-01-01T00:00:00Z'), Date.now())).toBe(0);
  });
});
