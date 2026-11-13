import { describe, it, expect } from 'vitest';
import { dayInfo, generateProgram, DEFAULT_TEMPLATE } from '@/lib/program';

describe('dayInfo: Day 1–4 by category, repeating', () => {
  it('cycles Day 1→4 in template order with the cycle number', () => {
    const keys = DEFAULT_TEMPLATE.rotation;
    const labels = [1, 2, 3, 4, 5, 8, 64].map((seq) => dayInfo({ seq, template_key: keys[(seq - 1) % keys.length] }));
    expect(labels.map((d) => d.day)).toEqual([1, 2, 3, 4, 1, 4, 4]);
    expect(labels.map((d) => d.cycle)).toEqual([1, 1, 1, 1, 2, 2, 16]);
    expect(labels[0].label).toBe('Day 1 · Upper · Push');
    expect(labels[1].label).toBe('Day 2 · Lower · Quads');
    expect(labels[2].label).toBe('Day 3 · Upper · Pull');
    expect(labels[3].label).toBe('Day 4 · Lower · Hinge');
  });

  it('matches the generated program: same day number ⇒ same category', () => {
    const { sessions } = generateProgram({ template: DEFAULT_TEMPLATE, programId: '00000000-0000-4000-8000-000000000001', userId: 'u', startDate: '2026-11-10', now: new Date('2026-11-10T00:00:00Z') } as never);
    const byDay = new Map<number, Set<string>>();
    for (const s of sessions) {
      const d = dayInfo(s);
      byDay.set(d.day, (byDay.get(d.day) ?? new Set()).add(d.category));
    }
    expect([...byDay.keys()].sort()).toEqual([1, 2, 3, 4]);
    for (const cats of byDay.values()) expect(cats.size).toBe(1);
  });

  it('falls back to the title for unknown templates', () => {
    expect(dayInfo({ seq: 6, template_key: 'custom', title: 'Full Body — Conditioning' }).label).toBe('Day 2 · Conditioning');
  });
});
