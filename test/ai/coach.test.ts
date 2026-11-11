// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COACH_DAILY_CAP,
  MAX_COACH_DAILY_CAP,
  checkDailyCap,
  countUserMessagesOn,
  resolveDailyCap,
  toModelHistory,
} from '@/lib/ai/coach';
import { COACH_SYSTEM_PROMPT, buildCoachSystem } from '@/lib/ai/prompts';
import { buildStatsPack } from '@/lib/ai/stats';
import { richInput } from './fixtures';

describe('daily cap', () => {
  it('uses user_settings.coach_daily_cap when present, else the default', () => {
    expect(resolveDailyCap(null)).toBe(DEFAULT_COACH_DAILY_CAP);
    expect(resolveDailyCap({})).toBe(DEFAULT_COACH_DAILY_CAP);
    expect(resolveDailyCap({ coach_daily_cap: 5 })).toBe(5);
    expect(resolveDailyCap({ coach_daily_cap: 0 })).toBe(0);
    expect(resolveDailyCap({ coach_daily_cap: -1 })).toBe(DEFAULT_COACH_DAILY_CAP);
    expect(resolveDailyCap({ coach_daily_cap: 10_000 })).toBe(MAX_COACH_DAILY_CAP);
  });

  it('counts only user messages on the local calendar day', () => {
    const msgs = [
      { role: 'user' as const, created_at: '2026-11-10T01:00:00Z' }, // Nov 9 in LA
      { role: 'user' as const, created_at: '2026-11-10T15:00:00Z' },
      { role: 'assistant' as const, created_at: '2026-11-10T15:00:05Z' },
      { role: 'user' as const, created_at: '2026-11-09T12:00:00Z' },
    ];
    expect(countUserMessagesOn(msgs, '2026-11-10', 'UTC')).toBe(2);
    expect(countUserMessagesOn(msgs, '2026-11-10', 'America/Los_Angeles')).toBe(1);
    expect(countUserMessagesOn(msgs, '2026-11-09', 'America/Los_Angeles')).toBe(2);
  });

  it('blocks at the cap', () => {
    expect(checkDailyCap(0, 3)).toEqual({ cap: 3, used: 0, remaining: 3, allowed: true });
    expect(checkDailyCap(2, 3)).toMatchObject({ remaining: 1, allowed: true });
    expect(checkDailyCap(3, 3)).toMatchObject({ remaining: 0, allowed: false });
    expect(checkDailyCap(9, 3)).toMatchObject({ remaining: 0, allowed: false });
    expect(checkDailyCap(0, 0).allowed).toBe(false);
  });
});

describe('history + prompt', () => {
  it('orders oldest→newest, keeps the last N, drops empty', () => {
    const rows = [
      { role: 'assistant' as const, content: 'b', created_at: '2026-11-10T10:00:01Z' },
      { role: 'user' as const, content: 'a', created_at: '2026-11-10T10:00:00Z' },
      { role: 'user' as const, content: 'c', created_at: '2026-11-10T11:00:00Z' },
      { role: 'assistant' as const, content: ' ', created_at: '2026-11-10T11:00:01Z' },
    ];
    expect(toModelHistory(rows, 10)).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ]);
    expect(toModelHistory(rows, 2)).toEqual([{ role: 'user', content: 'c' }]);
  });

  it('coach prompt forbids skipping/unlocking/editing and embeds the stats pack', () => {
    expect(COACH_SYSTEM_PROMPT).toMatch(/CANNOT skip sessions, unlock sessions, or edit/);
    const sys = buildCoachSystem(buildStatsPack(richInput()));
    expect(sys).toContain('"nextSession"');
    expect(sys).toContain('Today is 2026-11-10');
  });
});
