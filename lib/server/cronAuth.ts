import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Refuse everything
 * when the secret is unset (no "Bearer undefined" bypass) and compare in
 * constant time.
 */
export function isCronAuthorized(header: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || !header) return false;
  const a = createHash('sha256').update(header).digest();
  const b = createHash('sha256').update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}
