/**
 * Plain-language sync and server errors (UX_PLAN §4). Raw text stays available
 * behind a "Details" disclosure; people never see "TypeError: Failed to fetch".
 */
import type { OutboxPayload } from '@/lib/local/db';

export const UNREACHABLE = "Can't reach the server. Everything is saved on this phone and will send when it can.";

const NETWORK = /failed to fetch|networkerror|network request failed|load failed|fetch failed|aborted|timeout|timed out|err_internet|offline|^\s*0\s/i;

const CODES: [RegExp, string][] = [
  [/not_started/, 'the session hadn’t been started on the server'],
  [/session_complete/, 'that session is already complete'],
  [/session_locked/, 'that session is still locked'],
  [/session_incomplete/, 'not every working set was done'],
  [/cannot_untick/, 'completed sets can’t be unticked'],
  [/active_program_exists|program_exists/, 'a program is already running'],
  [/42501|permission denied|not authenticated|28000|jwt|PGRST30/i, 'the server didn’t accept the app’s sign-in key'],
  [/23503/, 'something it depends on hadn’t reached the server yet'],
];

/** One sentence for a sync error string, or null if there's nothing to show. */
export function humanizeError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (NETWORK.test(raw)) return UNREACHABLE;
  for (const [re, text] of CODES) if (re.test(raw)) return `The server refused a change: ${text}.`;
  return 'The server refused a change.';
}

/** What a queued change was, in words. */
export function describeOp(p: OutboxPayload): string {
  if (p.kind === 'rpc') {
    return (
      { complete_session: 'Completing a session', start_session: 'Starting a session', reset_session: 'Resetting a session', refresh_unlocks: 'Checking unlocks' } as Record<string, string>
    )[p.fn] ?? 'A server action';
  }
  const table = p.table as string;
  return (
    {
      set_logs: 'A logged set',
      program_sessions: 'Session notes or cardio',
      session_exercises: 'An exercise swap',
      user_settings: 'Settings',
      body_weights: 'Bodyweight',
      programs: 'Starting the program',
    } as Record<string, string>
  )[table] ?? 'A change';
}

/** Why a queued change was refused, from its stored error. */
export function refusalReason(lastError: string | null | undefined): string {
  if (!lastError) return 'the server refused it';
  if (NETWORK.test(lastError)) return 'the server couldn’t be reached';
  for (const [re, text] of CODES) if (re.test(lastError)) return text;
  return 'the server refused it';
}
