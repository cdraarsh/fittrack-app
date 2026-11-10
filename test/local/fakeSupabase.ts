import type { SupabaseClient } from '@supabase/supabase-js';

export interface Call {
  kind: 'upsert' | 'update' | 'rpc' | 'select';
  table?: string;
  fn?: string;
  rows?: unknown;
  opts?: unknown;
  patch?: unknown;
  id?: unknown;
  args?: unknown;
}
type Resp = { error: { message: string; code?: string } | null; status?: number; data?: unknown };

/**
 * Minimal stand-in for the supabase-js query builder. `respond` decides each
 * write's outcome; `tables` serves selects for pull().
 */
export function fakeSupabase(opts: { respond?: (c: Call) => Resp | Promise<Resp>; tables?: Record<string, unknown[]> } = {}) {
  const calls: Call[] = [];
  const respond = opts.respond ?? (() => ({ error: null, status: 200 }));
  const tables = opts.tables ?? {};

  const select = (table: string) => {
    const filters: [string, string, unknown][] = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every(([op, col, v]) => {
      const x = (r as Record<string, unknown>)[col];
      return op === 'eq' ? x === v : op === 'gt' ? String(x) > String(v) : true;
    }));
    const qb = {
      eq(col: string, v: unknown) { filters.push(['eq', col, v]); return qb; },
      gt(col: string, v: unknown) { filters.push(['gt', col, v]); return qb; },
      order() { return qb; },
      range(from: number, to: number) { calls.push({ kind: 'select', table }); return Promise.resolve({ data: rows().slice(from, to + 1), error: null }); },
      maybeSingle() { calls.push({ kind: 'select', table }); return Promise.resolve({ data: rows()[0] ?? null, error: null }); },
    };
    return qb;
  };

  const client = {
    from(table: string) {
      return {
        upsert: async (rows: unknown, o: unknown) => { const c: Call = { kind: 'upsert', table, rows, opts: o }; calls.push(c); return respond(c); },
        update: (patch: unknown) => ({
          eq: async (_col: string, id: unknown) => { const c: Call = { kind: 'update', table, patch, id }; calls.push(c); return respond(c); },
        }),
        select: () => select(table),
      };
    },
    rpc: async (fn: string, args?: unknown) => { const c: Call = { kind: 'rpc', fn, args }; calls.push(c); return respond(c); },
  };
  return { client: client as unknown as SupabaseClient, calls };
}
