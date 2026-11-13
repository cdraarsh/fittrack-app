// @vitest-environment node
/** Adversarial: start_session / reset_session and the set_logs guard in PGlite. A FAILING test = defect. */
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const FILES = fs.readdirSync(MIGRATIONS).filter((f) => f.startsWith('2026111') && !f.includes('drop_parked')).sort();
const P = '00000000-0000-4000-8000-0000000000c1';
const S = (n: number) => `00000000-0000-4000-8000-0000000001c${n}`;
const E = (n: number) => `00000000-0000-4000-8000-0000000002c${n}`;
const L = (n: number, i: number) => `00000000-0000-4000-8000-00000000${n}d${i}0`;

let db: PGlite;
const as = (sub: string) => db.exec(`reset role; set request.jwt.claims = '${JSON.stringify({ sub, role: 'authenticated' })}'; set role authenticated;`);
const asNoJwt = (role: string) => db.exec(`reset role; set request.jwt.claims = ''; set role ${role};`);
const one = async <T>(sql: string) => (await db.query<T>(sql)).rows[0];
const status = async (n: number) =>
  (await one<{ status: string; started_at: string | null; unlocked_at: string | null }>(`select status, started_at, unlocked_at from program_sessions where id='${S(n)}'`))!;
async function fails(sql: string) {
  try {
    await db.query(sql);
  } catch (e) {
    return (e as Error).message;
  }
  return null;
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

describe('adversarial: start/reset SQL', () => {
  it('a client set_logs write into an up_next session must not silently start it (stale queued write after a reset)', async () => {
    await as('u1');
    await db.query(`select start_session('${S(1)}')`);
    await db.exec(`insert into set_logs (id,session_exercise_id,user_id,set_index,weight_kg,reps,done) values ('${L(1, 0)}','${E(1)}','u1',0,40,8,true)`);
    await db.query(`select reset_session('${S(1)}')`);
    expect((await status(1)).status).toBe('up_next');

    // Device B's queued upsert of the same set arrives after the reset.
    const err = await fails(
      `insert into set_logs (id,session_exercise_id,user_id,set_index,weight_kg,reps,done,updated_at) values ('${L(1, 0)}','${E(1)}','u1',0,40,8,true, now()) on conflict (id) do update set reps = excluded.reps, updated_at = excluded.updated_at`,
    );
    const st = await status(1);
    // Either refuse the write (not_started) or at least keep the session up next.
    expect({ refused: err !== null, status: st.status }).toEqual({ refused: true, status: 'up_next' });
  });

  it('start_session must not accept a started_at before the session unlocked (client clock / hostile arg)', async () => {
    await as('u1');
    await db.query(`select reset_session('${S(1)}')`);
    await db.query(`select start_session('${S(1)}', '1970-01-01T00:00:00Z')`);
    const st = await status(1);
    expect(st.status).toBe('in_progress');
    expect(new Date(st.started_at!).getTime()).toBeGreaterThanOrEqual(new Date(st.unlocked_at ?? '2026-01-01').getTime() - 1000);
  });

  it('holds: anon cannot execute start/reset', async () => {
    await db.exec(`reset role; set request.jwt.claims = '{"role":"anon"}'; set role anon;`);
    expect(await fails(`select start_session('${S(1)}')`)).toMatch(/permission denied/);
    expect(await fails(`select reset_session('${S(1)}')`)).toMatch(/permission denied/);
  });

  it('holds: other user, unknown and null ids are refused', async () => {
    await as('u2');
    expect(await fails(`select reset_session('${S(1)}')`)).toMatch(/session not found/);
    await as('u1');
    expect(await fails(`select reset_session(null)`)).toMatch(/session not found/);
    expect(await fails(`select start_session('00000000-0000-4000-8000-00000000ffff')`)).toMatch(/session not found/);
  });

  it('holds: start of a locked session refused; reset of a locked session refused', async () => {
    await as('u1');
    expect(await fails(`select start_session('${S(2)}')`)).toMatch(/session_locked/);
    expect(await fails(`select reset_session('${S(2)}')`)).toMatch(/session_locked/);
  });

  it('holds: start is idempotent (second call keeps started_at), reset idempotent', async () => {
    await as('u1');
    const a = (await status(1)).started_at;
    await db.query(`select start_session('${S(1)}', now())`);
    expect((await status(1)).started_at).toEqual(a);
    await db.query(`select reset_session('${S(1)}')`);
    await db.query(`select reset_session('${S(1)}')`);
    expect((await status(1)).status).toBe('up_next');
  });

  it('holds: complete_session after a reset (no sets) is refused', async () => {
    await as('u1');
    await db.query(`select start_session('${S(1)}')`);
    expect(await fails(`select complete_session('${S(1)}')`)).toMatch(/session_incomplete/);
  });

  it('note: an authenticated DB role with NO jwt claims is treated as trusted (pre-existing _is_trusted)', async () => {
    await asNoJwt('authenticated');
    // Not reachable through PostgREST (it always sets claims), documented only.
    expect(await fails(`select reset_session('${S(1)}')`)).toBeNull();
    await db.exec('reset role');
  });
});
