import Dexie, { type Table } from 'dexie';
import type { Exercise } from '@/lib/exercises/types';
import type { BodyWeight, Program, ProgramSession, SessionExercise, SetLog, UserSettings } from '@/lib/program/types';

/** Tables that sync to Supabase (same names as Postgres). */
export type SyncTable = 'programs' | 'program_sessions' | 'session_exercises' | 'set_logs' | 'body_weights' | 'user_settings';

export type OutboxPayload =
  | {
      kind: 'upsert';
      table: SyncTable;
      rows: Record<string, unknown>[];
      onConflict?: string;
      /** Structural rows (program/sessions/exercises) are insert-only: ON CONFLICT DO NOTHING. */
      ignoreDuplicates?: boolean;
    }
  | { kind: 'update'; table: 'program_sessions' | 'session_exercises'; id: string; patch: Record<string, unknown> }
  | { kind: 'rpc'; fn: 'complete_session' | 'refresh_unlocks' | 'start_session' | 'reset_session'; args: Record<string, unknown> };

export interface OutboxOp {
  /** Auto-increment: flush order. */
  seq?: number;
  /** Client UUID of this operation. */
  id: string;
  /** Coalescing key: a newer op with the same key replaces the payload in place. */
  key: string | null;
  /** Bumped on every coalesce, so an in-flight send doesn't delete a newer payload. */
  rev: number;
  payload: OutboxPayload;
  status: 'pending' | 'failed';
  attempts: number;
  last_error: string | null;
  created_at: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * IndexedDB mirror of the v2 tables. The phone holds the working copy; every
 * write lands here first and is queued in `outbox` for Supabase.
 */
export class FitDB extends Dexie {
  exercises!: Table<Exercise, string>;
  programs!: Table<Program, string>;
  program_sessions!: Table<ProgramSession, string>;
  session_exercises!: Table<SessionExercise, string>;
  set_logs!: Table<SetLog, string>;
  body_weights!: Table<BodyWeight, [string, string]>;
  user_settings!: Table<UserSettings, string>;
  outbox!: Table<OutboxOp, number>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'fittrack') {
    super(name);
    this.version(1).stores({
      exercises: 'id, swap_group',
      programs: 'id, user_id, status',
      program_sessions: 'id, program_id, [program_id+seq], status',
      session_exercises: 'id, session_id, exercise_id',
      set_logs: 'id, session_exercise_id, session_id, [session_exercise_id+set_index], updated_at',
      body_weights: '[user_id+date], date',
      user_settings: 'user_id',
      outbox: '++seq, key, status',
      meta: 'key',
    });
  }
}

let instance: FitDB | null = null;

/** App-wide database (browser only). */
export function getDb(): FitDB {
  if (!instance) instance = new FitDB();
  return instance;
}

export async function getMeta<T>(db: FitDB, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(db: FitDB, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
