import { describe, it, expect } from 'vitest';
import { advance, localDate, isUnlockDue, addDays, type SessionNode, type ProgressionContext } from '@/lib/program/unlock';

const TZ = 'Asia/Kolkata'; // UTC+5:30, no DST
const mk = (n: number): SessionNode[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    seq: i + 1,
    status: i === 0 ? 'up_next' : 'locked',
    unlocked_at: i === 0 ? '2026-11-02T03:00:00Z' : null,
    started_at: null,
    completed_at: null,
  }));
const ctx = (now: string, rule: ProgressionContext['rule'] = 'next_calendar_day', timeZone = TZ): ProgressionContext => ({ now, rule, timeZone });
const status = (ss: SessionNode[]) => ss.map((s) => s.status);

/** Log a set then complete — the normal path for one session. */
function train(ss: SessionNode[], id: string, now: string, rule: ProgressionContext['rule'] = 'next_calendar_day') {
  const a = advance(ss, { type: 'log_set', sessionId: id }, ctx(now, rule));
  expect(a.ok).toBe(true);
  const b = advance(a.sessions, { type: 'complete', sessionId: id, allWorkingSetsDone: true }, ctx(now, rule));
  expect(b.ok).toBe(true);
  return b;
}

describe('localDate / isUnlockDue', () => {
  it('uses the local calendar day, not UTC', () => {
    // 20:00Z on Nov 2 is 01:30 on Nov 3 in Kolkata
    expect(localDate('2026-11-02T20:00:00Z', TZ)).toBe('2026-11-03');
    expect(localDate('2026-11-02T20:00:00Z', 'UTC')).toBe('2026-11-02');
  });
  it('next_calendar_day needs a strictly later local date', () => {
    expect(isUnlockDue('2026-11-02T10:00:00Z', '2026-11-02T18:00:00Z', 'next_calendar_day', TZ)).toBe(false); // 23:30 same day
    expect(isUnlockDue('2026-11-02T10:00:00Z', '2026-11-02T18:31:00Z', 'next_calendar_day', TZ)).toBe(true); // 00:01 next day
    expect(isUnlockDue('2026-11-02T10:00:00Z', '2026-11-02T10:00:01Z', 'immediate', TZ)).toBe(true);
  });
  it('handles DST zones', () => {
    // US DST ends 2026-11-01 02:00 local
    expect(localDate('2026-11-01T06:30:00Z', 'America/New_York')).toBe('2026-11-01');
    expect(localDate('2026-11-01T03:30:00Z', 'America/New_York')).toBe('2026-10-31');
  });
  it('addDays crosses months', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  });
});

describe('advance — state machine', () => {
  it('first set moves up_next → in_progress and stamps started_at', () => {
    const r = advance(mk(3), { type: 'log_set', sessionId: 's1' }, ctx('2026-11-02T05:00:00Z'));
    expect(r.ok).toBe(true);
    expect(status(r.sessions)).toEqual(['in_progress', 'locked', 'locked']);
    expect(r.sessions[0].started_at).toBe('2026-11-02T05:00:00Z');
    expect(r.changed).toEqual(['s1']);
    expect(r.current?.id).toBe('s1');
  });

  it('refuses to complete with missing working sets', () => {
    const a = advance(mk(3), { type: 'log_set', sessionId: 's1' }, ctx('2026-11-02T05:00:00Z'));
    const r = advance(a.sessions, { type: 'complete', sessionId: 's1', allWorkingSetsDone: false }, ctx('2026-11-02T06:00:00Z'));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('incomplete');
    expect(status(r.sessions)).toEqual(['in_progress', 'locked', 'locked']);
  });

  it('next_calendar_day: next session stays locked the same day, unlocks the next local day', () => {
    const done = train(mk(3), 's1', '2026-11-02T05:00:00Z');
    expect(status(done.sessions)).toEqual(['complete', 'locked', 'locked']);
    expect(done.current).toBeNull();
    expect(done.waiting?.id).toBe('s2');
    expect(done.unlocksOn).toBe('2026-11-03');

    const lateSameDay = advance(done.sessions, { type: 'refresh' }, ctx('2026-11-02T18:00:00Z')); // 23:30 IST
    expect(status(lateSameDay.sessions)).toEqual(['complete', 'locked', 'locked']);

    const tomorrow = advance(done.sessions, { type: 'refresh' }, ctx('2026-11-02T18:40:00Z')); // 00:10 IST
    expect(status(tomorrow.sessions)).toEqual(['complete', 'up_next', 'locked']);
    expect(tomorrow.sessions[1].unlocked_at).toBe('2026-11-02T18:40:00Z');
    expect(tomorrow.changed).toEqual(['s2']);
  });

  it('immediate rule unlocks the next session on completion', () => {
    const done = train(mk(3), 's1', '2026-11-02T05:00:00Z', 'immediate');
    expect(status(done.sessions)).toEqual(['complete', 'up_next', 'locked']);
    expect(done.current?.id).toBe('s2');
  });

  it('no jumping ahead: logging or completing a locked session is refused', () => {
    const r1 = advance(mk(3), { type: 'log_set', sessionId: 's3' }, ctx('2026-11-02T05:00:00Z'));
    expect(r1).toMatchObject({ ok: false, error: 'locked' });
    const r2 = advance(mk(3), { type: 'complete', sessionId: 's2', allWorkingSetsDone: true }, ctx('2026-11-02T05:00:00Z'));
    expect(r2).toMatchObject({ ok: false, error: 'locked' });
    expect(status(r2.sessions)).toEqual(['up_next', 'locked', 'locked']);
  });

  it('even with the immediate rule you cannot open two sessions at once', () => {
    const r = advance(mk(3), { type: 'log_set', sessionId: 's2' }, ctx('2026-11-02T05:00:00Z', 'immediate'));
    expect(r.error).toBe('locked');
  });

  it('missed days delay, never skip', () => {
    const done = train(mk(4), 's1', '2026-11-02T05:00:00Z');
    // nine days off
    const later = advance(done.sessions, { type: 'refresh' }, ctx('2026-11-11T05:00:00Z'));
    expect(status(later.sessions)).toEqual(['complete', 'up_next', 'locked', 'locked']);
    // and a few more: still the same session waiting
    const evenLater = advance(later.sessions, { type: 'refresh' }, ctx('2026-11-20T05:00:00Z'));
    expect(status(evenLater.sessions)).toEqual(['complete', 'up_next', 'locked', 'locked']);
    expect(evenLater.changed).toEqual([]);
  });

  it('defensively relocks anything open beyond the frontier', () => {
    const bad = mk(3).map((s) => (s.id === 's3' ? { ...s, status: 'up_next' as const } : s));
    const r = advance(bad, { type: 'refresh' }, ctx('2026-11-02T05:00:00Z'));
    expect(status(r.sessions)).toEqual(['up_next', 'locked', 'locked']);
  });

  it('completing twice is idempotent', () => {
    const done = train(mk(2), 's1', '2026-11-02T05:00:00Z', 'immediate');
    const again = advance(done.sessions, { type: 'complete', sessionId: 's1', allWorkingSetsDone: true }, ctx('2026-11-02T06:00:00Z', 'immediate'));
    expect(again.ok).toBe(true);
    expect(again.sessions[0].completed_at).toBe('2026-11-02T05:00:00Z');
  });

  it('logging to a complete session (typo fix) keeps it complete', () => {
    const done = train(mk(2), 's1', '2026-11-02T05:00:00Z');
    const r = advance(done.sessions, { type: 'log_set', sessionId: 's1' }, ctx('2026-11-02T07:00:00Z'));
    expect(r.ok).toBe(true);
    expect(r.sessions[0].status).toBe('complete');
  });

  it('last session complete → programComplete (offer next block)', () => {
    let ss = mk(3);
    const days = ['2026-11-02', '2026-11-03', '2026-11-04'];
    ss.forEach((_, i) => {
      const r = advance(ss, { type: 'refresh' }, ctx(`${days[i]}T05:00:00Z`));
      ss = train(r.sessions, `s${i + 1}`, `${days[i]}T06:00:00Z`).sessions;
    });
    const r = advance(ss, { type: 'refresh' }, ctx('2026-11-05T05:00:00Z'));
    expect(r.programComplete).toBe(true);
    expect(r.current).toBeNull();
    expect(r.waiting).toBeNull();
  });

  it('first session of a fresh block unlocks without a predecessor', () => {
    const fresh = mk(2).map((s) => ({ ...s, status: 'locked' as const, unlocked_at: null }));
    const r = advance(fresh, { type: 'refresh' }, ctx('2026-11-02T05:00:00Z'));
    expect(status(r.sessions)).toEqual(['up_next', 'locked']);
  });

  it('works on unsorted input and does not mutate it', () => {
    const input = mk(3).reverse();
    const snapshot = JSON.stringify(input);
    const r = advance(input, { type: 'log_set', sessionId: 's1' }, ctx('2026-11-02T05:00:00Z'));
    expect(r.sessions.map((s) => s.seq)).toEqual([1, 2, 3]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('unknown session → not_found', () => {
    expect(advance(mk(1), { type: 'log_set', sessionId: 'nope' }, ctx('2026-11-02T05:00:00Z')).error).toBe('not_found');
  });
});

describe('start and reset', () => {
  const now = '2026-11-03T04:00:00Z';
  it('start: up_next → in_progress with started_at; idempotent; refuses locked', () => {
    const a = advance(mk(3), { type: 'start', sessionId: 's1' }, ctx(now));
    expect(a.ok).toBe(true);
    expect(status(a.sessions)).toEqual(['in_progress', 'locked', 'locked']);
    expect(a.sessions[0].started_at).toBe(now);
    const again = advance(a.sessions, { type: 'start', sessionId: 's1' }, ctx('2026-11-03T05:00:00Z'));
    expect(again.changed).toEqual([]);
    expect(again.sessions[0].started_at).toBe(now);
    expect(advance(mk(3), { type: 'start', sessionId: 's2' }, ctx(now)).error).toBe('locked');
  });

  it('reset: in_progress → up_next, clears started_at, never touches later sessions', () => {
    const started = advance(mk(3), { type: 'start', sessionId: 's1' }, ctx(now)).sessions;
    const r = advance(started, { type: 'reset', sessionId: 's1' }, ctx(now));
    expect(r.ok).toBe(true);
    expect(status(r.sessions)).toEqual(['up_next', 'locked', 'locked']);
    expect(r.sessions[0].started_at).toBeNull();
    expect(r.current?.id).toBe('s1');
  });

  it('reset: no-op when up_next, refused when complete or locked', () => {
    expect(advance(mk(2), { type: 'reset', sessionId: 's1' }, ctx(now)).changed).toEqual([]);
    const done = train(mk(2), 's1', now).sessions;
    expect(advance(done, { type: 'reset', sessionId: 's1' }, ctx(now)).error).toBe('already_complete');
    expect(advance(done, { type: 'reset', sessionId: 's2' }, ctx(now)).error).toBe('locked');
  });
});
