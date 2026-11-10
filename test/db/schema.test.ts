// @vitest-environment node
/**
 * Runs the v2 migrations in PGlite (in-process Postgres) with a stubbed
 * Supabase `auth` schema and exercises RLS, column privileges, the set_logs
 * guard and complete_session(). Mirrors the lib/program/unlock.ts tests.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const FILES = ['20261110000000_v2_core.sql', '20261110000001_v2_exercise_seed.sql', '20261110000002_v2_drop_parked.sql'];

const P = '00000000-0000-4000-8000-000000000001';
const S = (n: number) => `00000000-0000-4000-8000-00000000010${n}`;
const E = (n: number) => `00000000-0000-4000-8000-00000000020${n}`;
const L = (n: number, i: number) => `00000000-0000-4000-8000-0000000003${n}${i}`;

let db: PGlite;

// What PostgREST's upsert generates: every payload column in the DO UPDATE SET list.
const ALL_SET_LOG_COLS = ['id', 'session_exercise_id', 'user_id', 'set_index', 'weight_kg', 'reps', 'done', 'updated_at']
  .map((c) => `${c} = excluded.${c}`)
  .join(', ');

async function as(sub: string) {
  await db.exec(`reset role; set request.jwt.claims = '${JSON.stringify({ sub, role: 'authenticated' })}'; set role authenticated;`);
}
async function asService() {
  await db.exec(`reset role; set request.jwt.claims = '{"role":"service_role"}';`);
}
async function asSuper() {
  await db.exec(`reset role; reset request.jwt.claims;`);
}
async function rows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  return (await db.query<T>(sql)).rows;
}
async function fails(sql: string): Promise<string> {
  try {
    await db.query(sql);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`expected failure: ${sql}`);
}
const statuses = async () => (await rows<{ status: string }>(`select status from program_sessions order by seq`)).map((r) => r.status);
const logSet = (n: number, i: number, extra = '') =>
  `insert into set_logs (id,session_exercise_id,user_id,set_index,weight_kg,reps,done${extra ? ',updated_at' : ''}) values ('${L(n, i)}','${E(n)}','u1',${i},40,10,true${extra ? `,'${extra}'` : ''}) on conflict (id) do update set ${ALL_SET_LOG_COLS}`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  for (const f of FILES) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));

  await as('u1');
  await db.exec(`insert into user_settings (user_id, timezone) values ('u1', 'Asia/Kolkata')`);
  // client tries to sneak in a completed program/sessions — triggers normalise it
  await db.exec(`insert into programs (id,user_id,name,template_key,sessions_per_week,weeks,status) values ('${P}','u1','p','t',4,1,'complete')`);
  for (const n of [1, 2, 3]) {
    await db.exec(`insert into program_sessions (id,program_id,user_id,seq,week,template_key,title,status,completed_at) values ('${S(n)}','${P}','u1',${n},1,'k','T${n}','complete',now())`);
    await db.exec(`insert into session_exercises (id,session_id,user_id,exercise_id,prescribed_exercise_id,position,sets,rep_lo,rep_hi) values ('${E(n)}','${S(n)}','u1','bench','bench',0,2,8,10)`);
  }
}, 30_000);

describe('v2 schema (PGlite)', () => {
  it('seeds the exercise library', async () => {
    expect((await rows<{ n: number }>(`select count(*)::int n from exercises`))[0].n).toBeGreaterThanOrEqual(23);
  });

  it('normalises client inserts: program active, session 1 up_next, rest locked', async () => {
    expect(await statuses()).toEqual(['up_next', 'locked', 'locked']);
    expect((await rows<{ status: string }>(`select status from programs`))[0].status).toBe('active');
  });

  it('rejects an unknown time zone', async () => {
    expect(await fails(`update user_settings set timezone = 'Nope/Zone'`)).toMatch(/time zone/);
  });

  it('refuses set logs on a locked session (no jumping ahead)', async () => {
    expect(await fails(logSet(2, 0))).toMatch(/session_locked/);
  });

  it('refuses to complete with missing working sets', async () => {
    expect(await fails(`select complete_session('${S(1)}')`)).toMatch(/session_incomplete/);
  });

  it('first set moves up_next → in_progress', async () => {
    await db.exec(logSet(1, 0, '2026-11-10T05:00:00Z'));
    expect(await statuses()).toEqual(['in_progress', 'locked', 'locked']);
  });

  it('clients cannot write status directly', async () => {
    expect(await fails(`update program_sessions set status = 'complete' where id = '${S(1)}'`)).toMatch(/permission denied/);
  });

  it('completes when every working set is done; next stays locked the same day', async () => {
    await db.exec(logSet(1, 1));
    const [{ r }] = await rows<{ r: { status: string; next_status: string } }>(`select complete_session('${S(1)}') r`);
    expect(r).toMatchObject({ status: 'complete', next_status: 'locked' });
    expect(await statuses()).toEqual(['complete', 'locked', 'locked']);
    expect(await fails(logSet(2, 0))).toMatch(/session_locked/);
    // idempotent
    expect((await rows<{ r: { status: string } }>(`select complete_session('${S(1)}') r`))[0].r.status).toBe('complete');
  });

  it('complete session: typo edits allowed, untick and new rows refused, stale writes ignored', async () => {
    expect(await fails(`update set_logs set done = false where id = '${L(1, 0)}'`)).toMatch(/cannot_untick/);
    expect(await rows(`update set_logs set reps = 9, updated_at = '2026-11-10T06:00:00Z' where id = '${L(1, 0)}' returning reps`)).toEqual([{ reps: 9 }]);
    expect(await rows(`update set_logs set reps = 7, updated_at = '2026-11-10T05:30:00Z' where id = '${L(1, 0)}' returning reps`)).toEqual([]);
    expect(await fails(`insert into set_logs (session_exercise_id,user_id,set_index,reps,done) values ('${E(1)}','u1',5,10,true)`)).toMatch(/session_complete/);
    // idempotent re-send of a done row from the outbox is fine
    await db.exec(logSet(1, 0, '2026-11-10T06:00:00Z'));
  });

  it('swaps only within the swap group and only on the current session', async () => {
    expect(await fails(`update session_exercises set exercise_id = 'db-bench' where id = '${E(3)}'`)).toMatch(/session_not_active/);
  });

  it('unlocks on a later local calendar day (missed days just delay)', async () => {
    await asSuper();
    await db.exec(`update program_sessions set completed_at = now() - interval '3 days' where id = '${S(1)}'`);
    await as('u1');
    await db.exec(logSet(2, 0));
    expect(await statuses()).toEqual(['complete', 'in_progress', 'locked']);
    expect(await fails(`update session_exercises set exercise_id = 'squat' where id = '${E(2)}'`)).toMatch(/swap_outside_group/);
    expect(await rows(`update session_exercises set exercise_id = 'db-bench' where id = '${E(2)}' returning exercise_id`)).toEqual([{ exercise_id: 'db-bench' }]);
  });

  it('watch data only fills empty fields; colliding app insert becomes an update', async () => {
    await asService();
    await db.exec(`update set_logs set weight_kg = null where id = '${L(2, 0)}'`);
    const filled = await rows<{ weight_kg: string; reps: number }>(
      `update set_logs set weight_kg = 50, reps = 12, source = 'watch', updated_at = now() + interval '1 second' where id = '${L(2, 0)}' returning weight_kg, reps`,
    );
    expect(Number(filled[0].weight_kg)).toBe(50);
    expect(filled[0].reps).toBe(10);
    await db.exec(`insert into set_logs (session_exercise_id,user_id,set_index,weight_kg,reps,done,source) values ('${E(2)}','u1',1,60,8,true,'watch')`);
    await as('u1');
    await db.exec(`insert into set_logs (id,session_exercise_id,user_id,set_index,weight_kg,reps,done,updated_at) values ('${L(2, 1)}','${E(2)}','u1',1,62.5,8,true, now() + interval '1 minute') on conflict (id) do update set reps = excluded.reps`);
    const r = await rows<{ n: number; w: string }>(`select count(*)::int n, max(weight_kg)::text w from set_logs where session_exercise_id = '${E(2)}' and set_index = 1`);
    expect(r[0]).toEqual({ n: 1, w: '62.50' });
  });

  it('RLS isolates users', async () => {
    await as('u2');
    expect((await rows<{ n: number }>(`select count(*)::int n from set_logs`))[0].n).toBe(0);
    expect(await fails(`insert into set_logs (session_exercise_id,user_id,set_index,reps,done) values ('${E(3)}','u2',0,10,true)`)).toMatch(/not found/);
    expect(await fails(`select complete_session('${S(2)}')`)).toMatch(/not found/);
  });

  it('immediate rule + last session → program complete, next block allowed', async () => {
    await as('u1');
    await db.exec(`select complete_session('${S(2)}')`);
    await db.exec(`update user_settings set unlock_rule = 'immediate', updated_at = now() + interval '1 hour'`);
    await db.exec(logSet(3, 0));
    await db.exec(logSet(3, 1));
    const [{ r }] = await rows<{ r: { program_complete: boolean } }>(`select complete_session('${S(3)}') r`);
    expect(r.program_complete).toBe(true);
    expect((await rows<{ status: string }>(`select status from programs`))[0].status).toBe('complete');
    expect(await rows(`insert into programs (name,template_key,sessions_per_week,weeks) values ('p2','t',4,16) returning status, user_id`)).toEqual([{ status: 'active', user_id: 'u1' }]);
  });
});
