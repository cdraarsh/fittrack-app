/**
 * Set-grid input parsing. Values are clamped to what the database stores
 * (weight numeric(6,2), reps/seconds integer) with sane human limits, so a typo
 * like 10000 kg or a stuck key can never produce a write the server refuses
 * forever (which would block completing the session and everything after it).
 */
export const LIMITS = { weight_kg: 999.75, reps: 999, seconds: 36_000 } as const;

export function parseSetValue(raw: string, field: 'weight_kg' | 'reps' | 'seconds'): number | null {
  // Plain numbers only: "42,5" (comma-locale keypads) means 42.5; "1e3" or
  // "4x" are rejected rather than silently read as 1 or 4.
  const v = raw.trim().replace(',', '.');
  if (v === '') return null;
  const ok = field === 'weight_kg' ? /^\+?\d+(\.\d+)?$|^\+?\.\d+$/.test(v) : /^\+?\d+$/.test(v);
  if (!ok) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  if (field === 'weight_kg') return Math.min(LIMITS.weight_kg, Math.round(n * 100) / 100);
  return Math.min(LIMITS[field], Math.floor(n));
}
