// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { FitDB } from '@/lib/local/db';
import { enqueue, flush, classifyError, pendingCount } from '@/lib/local/outbox';
import { fakeSupabase } from './fakeSupabase';

let db: FitDB;
let n = 0;
beforeEach(async () => {
  db = new FitDB(`test-outbox-${++n}`);
  await db.open();
});

const upsert = (id: string, reps: number) => ({ kind: 'upsert' as const, table: 'set_logs' as const, rows: [{ id, reps }], onConflict: 'id' });

describe('outbox', () => {
  it('assigns a client UUID per op and flushes in order', async () => {
    await enqueue(db, upsert('a', 1));
    await enqueue(db, upsert('b', 2));
    await enqueue(db, { kind: 'rpc', fn: 'complete_session', args: { session_id: 's' } });
    const ops = await db.outbox.toArray();
    expect(ops.every((o) => /^[0-9a-f-]{36}$/.test(o.id))).toBe(true);
    const { client, calls } = fakeSupabase();
    const r = await flush(db, client);
    expect(r).toMatchObject({ sent: 3, failed: 0, blocked: false });
    expect(calls.map((c) => c.kind + ':' + (c.table ?? c.fn))).toEqual(['upsert:set_logs', 'upsert:set_logs', 'rpc:complete_session']);
    expect(calls[0].opts).toEqual({ onConflict: 'id', ignoreDuplicates: false });
    expect(await db.outbox.count()).toBe(0);
  });

  it('coalesces pending ops with the same key in place (latest payload wins)', async () => {
    await enqueue(db, upsert('a', 1), 'set_logs:a');
    await enqueue(db, upsert('b', 1), 'set_logs:b');
    await enqueue(db, upsert('a', 9), 'set_logs:a');
    const ops = await db.outbox.orderBy('seq').toArray();
    expect(ops).toHaveLength(2);
    expect(ops[0].payload).toEqual(upsert('a', 9));
    expect(ops[0].rev).toBe(1);
  });

  it('stops on a transient error and keeps the op (and everything after it) pending', async () => {
    await enqueue(db, upsert('a', 1));
    await enqueue(db, upsert('b', 2));
    const { client, calls } = fakeSupabase({ respond: () => ({ error: { message: 'Failed to fetch' }, status: 0 }) });
    const r = await flush(db, client);
    expect(r.blocked).toBe(true);
    expect(calls).toHaveLength(1);
    expect(await pendingCount(db)).toBe(2);
    expect((await db.outbox.orderBy('seq').first())!.attempts).toBe(1);

    // back online: idempotent re-send succeeds
    const ok = fakeSupabase();
    expect((await flush(db, ok.client)).sent).toBe(2);
  });

  it('parks permanently rejected ops as failed and continues', async () => {
    await enqueue(db, { kind: 'rpc', fn: 'complete_session', args: { session_id: 's1' } });
    await enqueue(db, upsert('b', 2));
    const { client, calls } = fakeSupabase({
      respond: (c) => (c.kind === 'rpc' ? { error: { message: 'session_incomplete', code: 'P0001' }, status: 400 } : { error: null, status: 201 }),
    });
    const r = await flush(db, client);
    expect(r).toMatchObject({ sent: 1, failed: 1, blocked: false });
    expect(calls).toHaveLength(2);
    const failed = await db.outbox.toArray();
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ status: 'failed' });
    expect(failed[0].last_error).toContain('session_incomplete');
    expect(await pendingCount(db)).toBe(0);
  });

  it('keeps an op that was coalesced while in flight', async () => {
    await enqueue(db, upsert('a', 1), 'set_logs:a');
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { client, calls } = fakeSupabase({ respond: async () => { await gate; return { error: null, status: 201 }; } });
    const running = flush(db, client);
    await new Promise((r) => setTimeout(r, 10));
    await enqueue(db, upsert('a', 5), 'set_logs:a'); // edit lands mid-send
    release();
    await running;
    // the newer payload was re-sent in the same flush, then removed
    expect(calls.map((c) => (c.rows as { reps: number }[])[0].reps)).toEqual([1, 5]);
    expect(await db.outbox.count()).toBe(0);
  });

  it('concurrent flush calls share one run', async () => {
    await enqueue(db, upsert('a', 1));
    const { client, calls } = fakeSupabase();
    const [r1, r2] = await Promise.all([flush(db, client), flush(db, client)]);
    expect(r1).toBe(r2);
    expect(calls).toHaveLength(1);
  });

  it('classifies errors', () => {
    expect(classifyError({ message: 'x', status: 0 })).toBe('retry');
    expect(classifyError({ message: 'x', status: 503 })).toBe('retry');
    expect(classifyError({ message: 'jwt expired', code: 'PGRST301', status: 401 })).toBe('retry');
    expect(classifyError({ message: 'x', code: 'P0001', status: 400 })).toBe('permanent');
    expect(classifyError({ message: 'dup', code: '23505', status: 409 })).toBe('permanent');
    expect(classifyError({ message: 'priv', code: '42501', status: 403 })).toBe('permanent');
    // Transient right after a migration, or a parent row not synced yet.
    expect(classifyError({ message: 'schema cache', code: 'PGRST205', status: 404 })).toBe('retry');
    expect(classifyError({ message: 'column cache', code: 'PGRST204', status: 400 })).toBe('retry');
    expect(classifyError({ message: 'pool', code: 'PGRST003', status: 504 })).toBe('retry');
    expect(classifyError({ message: 'fk', code: '23503', status: 409 })).toBe('retry');
    expect(classifyError({ message: 'bad filter', code: 'PGRST100', status: 400 })).toBe('permanent');
  });
});
