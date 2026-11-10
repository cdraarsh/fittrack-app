// ─── Coach chat: daily cap + history helpers (pure) ──────────────────────────

import { localDate } from './stats';
import type { CoachMessageRow, UserSettingsRow } from './types';

/** Default user messages per day when user_settings has no coach_daily_cap. */
export const DEFAULT_COACH_DAILY_CAP = 20;
/** Hard ceiling regardless of settings (Groq free tier: 1K requests/day, tool steps count). */
export const MAX_COACH_DAILY_CAP = 100;
/** Messages replayed to the model as conversation history. */
export const COACH_HISTORY_LIMIT = 12;
export const MAX_COACH_MESSAGE_CHARS = 1000;

export function resolveDailyCap(settings: UserSettingsRow | null | undefined): number {
  const v = settings?.coach_daily_cap;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return DEFAULT_COACH_DAILY_CAP;
  return Math.min(Math.floor(v), MAX_COACH_DAILY_CAP);
}

/** User messages sent on `today` (calendar day in the user's timezone). */
export function countUserMessagesOn(
  messages: Pick<CoachMessageRow, 'role' | 'created_at'>[],
  today: string,
  timeZone?: string | null,
): number {
  return messages.filter(m => m.role === 'user' && localDate(m.created_at, timeZone) === today).length;
}

export interface CapStatus {
  cap: number;
  used: number;
  remaining: number;
  allowed: boolean;
}

export function checkDailyCap(used: number, cap: number): CapStatus {
  const remaining = Math.max(0, cap - used);
  return { cap, used, remaining, allowed: remaining > 0 };
}

/** Oldest → newest, last `limit` messages, as model messages. */
export function toModelHistory(rows: Pick<CoachMessageRow, 'role' | 'content' | 'created_at'>[], limit = COACH_HISTORY_LIMIT) {
  return [...rows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-limit)
    .filter(r => r.content.trim())
    .map(r => ({ role: r.role, content: r.content }));
}
