/** Personal API key expiry helpers (keys last 30/90/180/365 days; warn 7 days ahead). */

export const EXPIRY_WARNING_DAYS = 7;
export const KEY_LIFETIME_DAYS = [30, 90, 180, 365] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ExpiryStatus = 'unknown' | 'ok' | 'expiring' | 'expired';

export interface ExpiryInfo {
  status: ExpiryStatus;
  /** Days left, rounded up; <= 0 once expired. null if unknown. */
  daysLeft: number | null;
  expiresAt: string | null;
  /** User-facing line for Settings, or null when nothing to say. */
  message: string | null;
}

export function expiryWarning(
  expiresAt: string | Date | null | undefined,
  now: Date = new Date(),
  warnDays = EXPIRY_WARNING_DAYS,
): ExpiryInfo {
  if (!expiresAt) return { status: 'unknown', daysLeft: null, expiresAt: null, message: null };
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return { status: 'unknown', daysLeft: null, expiresAt: null, message: null };
  const msLeft = exp.getTime() - now.getTime();
  const iso = exp.toISOString();
  if (msLeft <= 0) {
    return {
      status: 'expired',
      daysLeft: Math.floor(msLeft / DAY_MS),
      expiresAt: iso,
      message: 'Your Garmin API key has expired. Create a new one on Garmin Connect and paste it in Settings.',
    };
  }
  const daysLeft = Math.ceil(msLeft / DAY_MS);
  if (msLeft <= warnDays * DAY_MS) {
    return {
      status: 'expiring',
      daysLeft,
      expiresAt: iso,
      message: `Your Garmin API key expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}. Create a new one on Garmin Connect before then.`,
    };
  }
  return { status: 'ok', daysLeft, expiresAt: iso, message: null };
}

/** Expiry from "created now with N-day lifetime". */
export function expiryFromLifetime(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * DAY_MS);
}
