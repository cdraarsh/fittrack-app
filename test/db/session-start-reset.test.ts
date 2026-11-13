// @vitest-environment node
/** start_session / reset_session in Postgres (PGlite), mirroring unlock.ts start/reset. */
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const FILES = fs.readdirSync(MIGRATIONS).filter((f) => f.startsWith('2026111') && !f.includes('drop_parked')).sort();
const P = '00000000-0000-4000-8000-0000000000a1';
const S = (n: number) => `00000000-0000-4000-8000-0000000001a${n}`;
const E = (n: number) => `00000000-0000-4000-8000-0000000002a${n}`;
const L = (n: number, i: number) => `00000000-0000-4000-8000-000000000${n}b${i}`.slice(0, 36);

let db: PGlite;
const as = (sub: string) => db.exec(`reset role; set request.jwt.claims = '${JSON.stringify({ sub, role: 'authenticated' })}'; set role authenticated;`);
const one = async <T>(sql: string) => (await db.query<T>(sql)).rows[0];
const status = async (n: number) => (await one<{ status: string; started_at: string | null }>(`select status, started_at from program_sessions where id='${S(n)}'`))!;
async function fails(sql: string) {
  try {
    await db.query(sql);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`expected failure: ${sql}`);
}

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
  await db.exec(`insert into user_settings (user_id, timezone, unlock_rule) values ('u1', 'UTC', 'immediate')`);
  await db.exec(`insert into programs (id,user_id,name,template_key,sessions_per_week,weeks,status) values ('${P}','u1','p','t',4,1,'active')`);
  for (const n of [1, 2]) {
    await db.exec(`insert into program_sessions (id,program_id,user_id,seq,week,template_key,title) values ('${S(n)}','${P}','u1',${n},1,'k','T${n}')`);
    await db.exec(`insert into session_exercises (id,session_id,user_id,exercise_id,prescribed_exercise_id,position,sets,rep_lo,rep_hi) values ('${E(n)}','${S(n)}','u1','bench','bench',0,1,8,10)`);
  }
}, 60_000);

describe('start_session / reset_session', () => {
  it('start moves up_next → in_progress; refuses the locked next session', async () => {
    await as('u1');
    expect((await status(1)).status).toBe('up_next');
    await db.query(`select start_session('${S(1)}', now() - interval '5 minutes')`);
    const s = await status(1);
    expect(s.status).toBe('in_progress');
    expect(s.started_at).not.toBeNull();
    expect(await fails(`select start_session('${S(2)}')`)).toMatch(/session_locked/);
  });

  it('another user cannot start or reset it', async () => {
    await as('u2');
    expect(await fails(`select reset_session('${S(1)}')`)).toMatch(/session not found/);
    expect(await fails(`select start_session('${S(1)}')`)).toMatch(/session not found/);
    await as('u1');
    expect((await status(1)).status).toBe('in_progress');
  });

  it('clients still cannot delete set logs or write status directly', async () => {
    await as('u1');
    await db.exec(`insert into set_logs (id,session_exercise_id,user_id,set_index,weight_kg,reps,done) values ('${L(1, 0)}','${E(1)}','u1',0,40,8,false)`);
    expect(await fails(`delete from set_logs where id='${L(1, 0)}'`)).toMatch(/permission denied/);
    expect(await fails(`update program_sessions set status='up_next' where id='${S(1)}'`)).toMatch(/permission denied/);
  });

  it('reset deletes the session sets and returns it to up_next', async () => {
    await as('u1');
    const r = await one<{ reset_session: { status: string; deleted_sets: number } }>(`select reset_session('${S(1)}')`);
    expect(r!.reset_session).toMatchObject({ status: 'up_next', deleted_sets: 1 });
    expect(await status(1)).toEqual({ status: 'up_next', started_at: null });
    expect((await one<{ n: number }>(`select count(*)::int as n from set_logs where session_id='${S(1)}'`))!.n).toBe(0);
    // idempotent on up_next
    expect((await one<{ reset_session: { deleted_sets: number } }>(`select reset_session('${S(1)}')`))!.reset_session.deleted_sets).toBe(0);
  });

  it('reset refuses a completed session and keeps its sets', async () => {
    await as('u1');
    await db.query(`select start_session('${S(1)}')`);
    await db.exec(`insert into set_logs (id,session_exercise_id,user_id,set_index,weight_kg,reps,done) values ('${L(1, 1)}','${E(1)}','u1',0,40,10,true) on conflict (id) do nothing`);
    await db.query(`select complete_session('${S(1)}')`);
    expect((await status(1)).status).toBe('complete');
    expect(await fails(`select reset_session('${S(1)}')`)).toMatch(/session_complete/);
    expect((await one<{ n: number }>(`select count(*)::int as n from set_logs where session_id='${S(1)}'`))!.n).toBe(1);
    expect((await status(2)).status).toBe('up_next'); // immediate rule
  });
});
