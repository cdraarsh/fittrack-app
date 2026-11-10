// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodeActiveSets, decodeStrengthFit, FitDecodeError, mapSetMesg, subtypeName } from '@/lib/garmin/fit';
import { buildFit as fit } from './helpers';

function buildFit(): Uint8Array {
  return fit([
    { setType: 'active', repetitions: 8, weight: 60, duration: 30.5, category: ['benchPress'], categorySubtype: [1], startTime: new Date('2026-11-09T10:00:00Z'), timestamp: new Date('2026-11-09T10:00:30Z') },
    { setType: 'rest', duration: 90, timestamp: new Date('2026-11-09T10:02:00Z') },
    { setType: 'active', repetitions: 10, weight: 40, duration: 25, category: ['row'], startTime: new Date('2026-11-09T10:03:00Z'), timestamp: new Date('2026-11-09T10:03:25Z') },
  ]);
}

describe('FIT decode', () => {
  it('reads set messages from a synthetic strength FIT', () => {
    const sets = decodeStrengthFit(buildFit());
    expect(sets).toHaveLength(3);
    expect(sets[0]).toMatchObject({
      index: 0,
      setType: 'active',
      category: 'benchPress',
      subtype: 1,
      subtypeName: 'barbellBenchPress',
      reps: 8,
      weightKg: 60,
      durationS: 30.5,
      startTime: '2026-11-09T10:00:00.000Z',
    });
    expect(sets[1].setType).toBe('rest');
    expect(sets[2]).toMatchObject({ category: 'row', subtype: null, reps: 10, weightKg: 40 });
  });

  it('filters to active sets', () => {
    const sets = decodeActiveSets(buildFit());
    expect(sets.map((s) => s.index)).toEqual([0, 2]);
  });

  it('rejects non-FIT bytes', () => {
    expect(() => decodeStrengthFit(new Uint8Array(20))).toThrow(FitDecodeError);
  });

  it('maps raw messages defensively', () => {
    expect(mapSetMesg({ setType: 1, category: 'unknown', categorySubtype: 0xffff }, 4)).toMatchObject({
      index: 4,
      setType: 'active',
      category: null,
      subtype: null,
      reps: null,
      weightKg: null,
    });
    expect(subtypeName('benchPress', 1)).toBe('barbellBenchPress');
    expect(subtypeName('notACategory', 1)).toBeNull();
  });
});
