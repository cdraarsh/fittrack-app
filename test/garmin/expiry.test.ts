// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { expiryFromLifetime, expiryWarning } from '@/lib/garmin/expiry';

const now = new Date('2026-11-10T12:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe('expiryWarning', () => {
  it('unknown when no date', () => {
    expect(expiryWarning(null, now)).toMatchObject({ status: 'unknown', message: null });
    expect(expiryWarning('garbage', now).status).toBe('unknown');
  });
  it('ok more than 7 days out', () => {
    expect(expiryWarning(inDays(8), now)).toMatchObject({ status: 'ok', daysLeft: 8, message: null });
  });
  it('expiring within 7 days', () => {
    const w = expiryWarning(inDays(7), now);
    expect(w.status).toBe('expiring');
    expect(w.daysLeft).toBe(7);
    expect(w.message).toMatch(/7 days/);
    expect(expiryWarning(inDays(0.5), now)).toMatchObject({ status: 'expiring', daysLeft: 1 });
    expect(expiryWarning(inDays(1), now).message).toMatch(/1 day\./);
  });
  it('expired', () => {
    expect(expiryWarning(inDays(-1), now).status).toBe('expired');
    expect(expiryWarning(now, now).status).toBe('expired');
  });
  it('lifetime helper', () => {
    expect(expiryFromLifetime(30, now).toISOString()).toBe(inDays(30));
  });
});
