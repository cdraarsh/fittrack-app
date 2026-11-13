/**
 * Plain-language sync and server errors (UX_PLAN §4). Raw text stays available
 * behind a "Details" disclosure; people never see "TypeError: Failed to fetch".
 */
import type { OutboxPayload } from '@/lib/local/db';

export const UNREACHABLE = "Can't reach the server. Everything is saved on this phone and will send when it can.";
export const RETRYING = 'The server is busy right now. Everything is saved on this phone and will send automatically.';

// Network-level failures only. "aborted" must be the fetch abort (our request
// timeout), not e.g. Postgres' "current transaction is aborted".
const NETWORK =
  /failed to fetch|networkerror|network request failed|load failed|fetch failed|operation was aborted|aborterror|signal is aborted|user aborted|timeout|timed out|err_internet|offline|^\s*0\s/i;
// Errors the outbox retries (see classifyError): not refusals.
const TRANSIENT =
  /jwt expired|jwt|PGRST30[123]|PGRST00[0-3]|PGRST20[45]|schema cache|service unavailable|bad gateway|gateway timeout|too many requests|rate limit|\b(429|502|503|504)\b|23503|foreign key/i;

const CODES: [RegExp, string][] = [
  [/not_started/, 'the session hadn’t been started on the server'],
  [/session_complete/, 'that session is already complete'],
  [/session_locked/, 'that session is still locked'],
  [/session_incomplete/, 'not every working set was done'],
  [/cannot_untick/, 'completed sets can’t be unticked'],
  [/active_program_exists|program_exists/, 'a program is already running'],
  [/42501|permission denied|not authenticated|28000/i, 'the server didn’t accept the app’s sign-in key'],
];

/** One sentence for a sync error string, or null if there's nothing to show. */
export function humanizeError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (NETWORK.test(raw)) return UNREACHABLE;
  if (TRANSIENT.test(raw)) return RETRYING;
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
  if (TRANSIENT.test(lastError)) return 'the server was busy (it will be retried)';
  for (const [re, text] of CODES) if (re.test(lastError)) return text;
  return 'the server refused it';
}
