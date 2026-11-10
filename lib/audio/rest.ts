/**
 * Timestamp-based rest timer state. The end time is stored, so the remaining
 * time is right after the app was backgrounded (no interval counting).
 */
import type { CueName } from './cues';

export interface RestState {
  endsAt: number; // epoch ms
  total: number; // seconds
}

export const REST_STORAGE_KEY = 'fittrack:rest';

export function startRest(seconds: number, now = Date.now()): RestState {
  return { endsAt: now + seconds * 1000, total: seconds };
}

/** Whole seconds left (0 once over). */
export function remainingSeconds(state: RestState, now = Date.now()): number {
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

/** How late a cue may still fire (e.g. after a brief background); older ones are dropped. */
export const STALE_CUE_MS = 1500;

/**
 * Cues that are due now and haven't fired yet: countdown beeps at 3, 2, 1 s
 * left and the "go" chime at 0. `fired` holds keys already played and is
 * updated in place.
 */
export function dueRestCues(state: RestState, now: number, fired: Set<string>): CueName[] {
  const out: CueName[] = [];
  const marks: { key: string; at: number; cue: CueName }[] = [3, 2, 1]
    .filter((s) => s < state.total)
    .map((s) => ({ key: `c${s}`, at: state.endsAt - s * 1000, cue: 'countdown' as const }));
  marks.push({ key: 'go', at: state.endsAt, cue: 'go' });
  for (const m of marks) {
    if (fired.has(m.key) || now < m.at) continue;
    fired.add(m.key);
    if (now - m.at <= STALE_CUE_MS) out.push(m.cue);
  }
  // A late return only plays the freshest cue, never a burst.
  return out.slice(-1);
}
