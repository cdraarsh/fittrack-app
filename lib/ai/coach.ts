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

// ─── Live context from the app (floating co-pilot) ───────────────────────────
// Sent by the client with each message: what page the user is on and the state
// of the session in front of them (fresher than the server stats pack when the
// phone hasn't synced). Untrusted input: whitelisted, typed and clamped.

export type CoachPage = 'today' | 'strength' | 'history' | 'settings';

export interface CoachContext {
  page: CoachPage;
  session?: {
    seq: number;
    title: string;
    status: 'up_next' | 'in_progress' | 'complete' | 'locked';
    elapsedMin?: number;
    setsDone?: number;
    setsTotal?: number;
    nextExercise?: string;
    paused?: boolean;
  };
}

const PAGES: readonly CoachPage[] = ['today', 'strength', 'history', 'settings'];
const STATUSES = ['up_next', 'in_progress', 'complete', 'locked'] as const;

function cleanText(v: unknown, max = 60): string | undefined {
  if (typeof v !== 'string') return undefined;
  // Control chars → space; invisible/bidi format chars (\p{Cf}: U+200B, U+202E, U+FEFF…) removed.
  const s = v.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\p{Cf}/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
  return s || undefined;
}
function cleanInt(v: unknown, min: number, max: number): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined;
}

export function parseCoachContext(raw: unknown): CoachContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const page = PAGES.includes(r.page as CoachPage) ? (r.page as CoachPage) : null;
  if (!page) return null;
  const ctx: CoachContext = { page };
  const s = r.session as Record<string, unknown> | undefined;
  if (s && typeof s === 'object') {
    const seq = cleanInt(s.seq, 1, 1000);
    const title = cleanText(s.title);
    const status = STATUSES.includes(s.status as (typeof STATUSES)[number]) ? (s.status as (typeof STATUSES)[number]) : undefined;
    if (seq !== undefined && title && status) {
      ctx.session = {
        seq,
        title,
        status,
        elapsedMin: cleanInt(s.elapsedMin, 0, 24 * 60),
        setsTotal: cleanInt(s.setsTotal, 0, 500),
        setsDone: cleanInt(s.setsDone, 0, cleanInt(s.setsTotal, 0, 500) ?? 500),
        nextExercise: cleanText(s.nextExercise),
        ...(s.paused === true && status === 'in_progress' ? { paused: true } : {}),
      };
    }
  }
  return ctx;
}

/** One short block for the system prompt; data only, never instructions. */
export function formatCoachContext(ctx: CoachContext | null): string {
  if (!ctx) return '';
  const lines = [`Screen: ${ctx.page}`];
  const s = ctx.session;
  if (s) {
    const state = s.paused ? 'paused (finish later)' : { up_next: 'up next, not started', in_progress: 'in progress', complete: 'complete', locked: 'locked' }[s.status];
    lines.push(`Session: Day ${s.seq} · ${JSON.stringify(s.title)} (${state})`);
    if (s.status === 'in_progress') {
      if (s.elapsedMin !== undefined) lines.push(`Elapsed: ${s.elapsedMin} min`);
      if (s.setsDone !== undefined && s.setsTotal !== undefined) lines.push(`Working sets done: ${s.setsDone}/${s.setsTotal}`);
      if (s.nextExercise) lines.push(`Next exercise: ${JSON.stringify(s.nextExercise)}`);
    }
  }
  return lines.join('\n');
}
