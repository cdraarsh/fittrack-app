import { describe, it, expect } from 'vitest';
import { resolveExpiry } from '@/lib/garmin/service';
import { isCronAuthorized } from '@/lib/server/cronAuth';

const now = new Date('2026-11-14T00:00:00Z');

describe('Garmin key expiry input', () => {
  it('accepts a future date within ~a year, refuses past or absurd dates', () => {
    expect(resolveExpiry({ expiresAt: '2027-05-01T00:00:00Z' }, now)).toBe('2027-05-01T00:00:00.000Z');
    expect(resolveExpiry({ expiresAt: '2026-01-01T00:00:00Z' }, now)).toBeNull();
    expect(resolveExpiry({ expiresAt: '2099-01-01T00:00:00Z' }, now)).toBeNull();
    expect(resolveExpiry({ expiresAt: 'garbage' }, now)).toBeNull();
    expect(resolveExpiry({ expiresInDays: 90 }, now)).not.toBeNull();
    expect(resolveExpiry({ expiresInDays: 7 }, now)).toBeNull();
  });
});

describe('cron auth', () => {
  it('refuses everything without a secret and compares the bearer exactly', () => {
    expect(isCronAuthorized('Bearer undefined', undefined)).toBe(false);
    expect(isCronAuthorized('Bearer ', '')).toBe(false);
    expect(isCronAuthorized(null, 's')).toBe(false);
    expect(isCronAuthorized('Bearer s', 's')).toBe(true);
    expect(isCronAuthorized('Bearer s2', 's')).toBe(false);
  });
});
