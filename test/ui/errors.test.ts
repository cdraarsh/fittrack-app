import { describe, it, expect } from 'vitest';
import { describeOp, humanizeError, refusalReason, UNREACHABLE } from '@/lib/ui/errors';

describe('plain-language errors', () => {
  it('network failures read as "saved on this phone"', () => {
    for (const raw of ['TypeError: Failed to fetch', 'NetworkError when attempting to fetch resource.', 'The operation was aborted.', 'Load failed']) {
      expect(humanizeError(raw)).toBe(UNREACHABLE);
    }
  });
  it('known server refusals are explained; unknown ones stay generic; nothing for empty', () => {
    expect(humanizeError('P0001 not_started')).toMatch(/hadn’t been started/);
    expect(humanizeError('P0001 session_complete')).toMatch(/already complete/);
    expect(humanizeError('42501 permission denied for table x')).toMatch(/sign-in key/);
    expect(humanizeError('XX000 weird internal thing')).toBe('The server refused a change.');
    expect(humanizeError(null)).toBeNull();
  });
  it('describes queued changes in words', () => {
    expect(describeOp({ kind: 'rpc', fn: 'complete_session', args: {} })).toBe('Completing a session');
    expect(describeOp({ kind: 'upsert', table: 'set_logs', rows: [], onConflict: 'id' } as never)).toBe('A logged set');
    expect(refusalReason('P0001 session_locked')).toBe('that session is still locked');
  });
});
