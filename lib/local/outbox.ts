import type { SupabaseClient } from '@supabase/supabase-js';
import type { FitDB, OutboxOp, OutboxPayload } from './db';

export const OUTBOX_EVENT = 'fittrack:outbox';
const MAX_ATTEMPTS = 10;

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Queue a write for Supabase. With a `key`, a still-pending op with the same
 * key is overwritten in place (latest payload wins, original position kept) —
 * e.g. repeated edits of one set become one upsert.
 */
export async function enqueue(db: FitDB, payload: OutboxPayload, key: string | null = null): Promise<void> {
  await db.transaction('rw', db.outbox, async () => {
    if (key) {
      // Coalesce in place unless a Start/Reset/Complete (rpc) was queued after the
      // existing op: moving this newer change ahead of it could reorder cause and
      // effect (e.g. a settings change made after Complete reaching the server
      // before complete_session). Then append instead.
      const existing = await db.outbox.where('key').equals(key).filter((o) => o.status === 'pending').last();
      const barrierAfter =
        existing && (await db.outbox.where('seq').above(existing.seq!).filter((o) => o.payload.kind === 'rpc').count()) > 0;
      if (existing && !barrierAfter) {
        await db.outbox.update(existing.seq!, { payload, rev: existing.rev + 1 });
        return;
      }
    }
    await db.outbox.add({
      id: uuid(),
      key,
      rev: 0,
      payload,
      status: 'pending',
      attempts: 0,
      last_error: null,
      created_at: new Date().toISOString(),
    });
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OUTBOX_EVENT));
}

export interface SendError {
  message: string;
  code?: string;
  status?: number;
}

/**
 * retry: transient (offline, 5xx, auth token not ready) — stop and try later.
 * permanent: the server refused the write (constraint / guard / privilege) —
 * park the op as `failed` and move on; the next pull restores server truth.
 */
export function classifyError(err: SendError): 'retry' | 'permanent' {
  const code = err.code ?? '';
  const status = err.status ?? 0;
  if (code === 'PGRST301' || code === 'PGRST302' || code === 'PGRST303') return 'retry'; // JWT
  // Connection/pool/timeout, and the schema cache still reloading after a
  // migration ("table/column not found in the schema cache"): try again later.
  if (/^PGRST00[0-3]$/.test(code) || code === 'PGRST204' || code === 'PGRST205') return 'retry';
  // Foreign key: the parent row (e.g. the session) hasn't reached the server yet.
  if (code === '23503') return 'retry';
  if (/^(P0001|P0002|23\d{3}|22\d{3}|42\d{3})$/.test(code)) return 'permanent';
  if (code.startsWith('PGRST')) return 'permanent';
  if (status === 0 || status === 401 || status === 408 || status === 429 || status >= 500) return 'retry';
  if (status >= 400) return 'permanent';
  return 'retry';
}

type Result = { error: { message: string; code?: string } | null; status?: number };

export async function sendOp(client: SupabaseClient, payload: OutboxPayload): Promise<SendError | null> {
  let res: Result;
  try {
    if (payload.kind === 'upsert') {
      res = await client
        .from(payload.table)
        .upsert(payload.rows, { onConflict: payload.onConflict, ignoreDuplicates: payload.ignoreDuplicates ?? false });
    } else if (payload.kind === 'update') {
      res = await client.from(payload.table).update(payload.patch).eq('id', payload.id);
    } else {
      res = await client.rpc(payload.fn, payload.args);
    }
  } catch (e) {
    return { message: e instanceof Error ? e.message : String(e), status: 0 };
  }
  if (!res.error) return null;
  return { message: res.error.message, code: res.error.code, status: res.status };
}

export interface FlushResult {
  sent: number;
  failed: number;
  /** Stopped early on a transient error; remaining ops stay pending. */
  blocked: boolean;
  lastError: string | null;
}

const inFlight = new WeakMap<FitDB, Promise<FlushResult>>();

/**
 * Send pending ops in order. One flush at a time per database; concurrent
 * callers share the running flush.
 */
export function flush(db: FitDB, client: SupabaseClient): Promise<FlushResult> {
  const running = inFlight.get(db);
  if (running) return running;
  const p = runFlush(db, client).finally(() => inFlight.delete(db));
  inFlight.set(db, p);
  return p;
}

async function runFlush(db: FitDB, client: SupabaseClient): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, blocked: false, lastError: null };
  for (;;) {
    const op: OutboxOp | undefined = await db.outbox.orderBy('seq').filter((o) => o.status === 'pending').first();
    if (!op) break;

    const err = await sendOp(client, op.payload);
    if (!err) {
      await db.transaction('rw', db.outbox, async () => {
        const cur = await db.outbox.get(op.seq!);
        // A newer payload was coalesced in while we were sending: keep it.
        if (cur && cur.rev === op.rev) await db.outbox.delete(op.seq!);
      });
      result.sent++;
      continue;
    }

    result.lastError = err.message;
    const kind = classifyError(err);
    const attempts = op.attempts + 1;
    if (kind === 'permanent' || attempts >= MAX_ATTEMPTS) {
      await db.outbox.update(op.seq!, { status: 'failed', attempts, last_error: `${err.code ?? err.status ?? ''} ${err.message}`.trim() });
      result.failed++;
      continue;
    }
    await db.outbox.update(op.seq!, { attempts, last_error: err.message });
    result.blocked = true;
    break;
  }
  return result;
}

export async function pendingCount(db: FitDB): Promise<number> {
  return db.outbox.filter((o) => o.status === 'pending').count();
}
