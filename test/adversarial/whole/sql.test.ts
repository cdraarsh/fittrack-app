// @vitest-environment node
/**
 * Adversarial whole-app pass: SQL (PGlite) with Supabase-like default grants.
 * A FAILING test = a defect.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { LIMITS, parseSetValue } from '@/lib/program/inputs';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const FILES = fs.readdirSync(MIGRATIONS).filter((f) => f.startsWith('2026111')).sort();
const P = '00000000-0000-4000-8000-0000000000c1';
const S = (n: number) => `00000000-0000-4000-8000-0000000001c${n}`;
const E = (n: number) => `00000000-0000-4000-8000-0000000002c${n}`;

let db: PGlite;
const as = (sub: string) => db.exec(`reset role; set request.jwt.claims = '${JSON.stringify({ sub, role: 'authenticated' })}'; set role authenticated;`);
const asAnon = () => db.exec(`reset role; set request.jwt.claims = '{"role":"anon"}'; set role anon;`);
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
    -- Supabase default: every new public table/function is granted to anon + authenticated.
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const f of FILES) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  await as('owner');
  await db.exec(`insert into user_settings (user_id, timezone, unlock_rule) values ('owner', 'UTC', 'immediate')`);
  await db.exec(`insert into programs (id,user_id,name,template_key,sessions_per_week,weeks) values ('${P}','owner','p','t',4,1)`);
  for (const n of [1, 2]) {
    await db.exec(`insert into program_sessions (id,program_id,user_id,seq,week,template_key,title) values ('${S(n)}','${P}','owner',${n},1,'k','T${n}')`);
    await db.exec(`insert into session_exercises (id,session_id,user_id,exercise_id,prescribed_exercise_id,position,sets,rep_lo,rep_hi) values ('${E(n)}','${S(n)}','owner','bench','bench',0,2,8,10)`);
  }
  await db.query(`select start_session('${S(1)}')`);
  await db.exec(`insert into coach_messages (user_id, role, content) values ('owner','user','hi')`);
  await db.exec(`insert into daily_insights (user_id, date, text, model) values ('owner','2026-11-14','x','rules')`);
}, 60_000);

describe('RLS / privileges (holds)', () => {
  it('anon sees nothing and cannot write AI tables, push subs or Garmin rows', async () => {
    await asAnon();
    for (const t of ['coach_messages', 'daily_insights', 'set_logs', 'program_sessions', 'user_settings']) {
      const r = await db.query<{ n: number }>(`select count(*)::int n from ${t}`).catch(() => ({ rows: [{ n: 0 }] }));
      expect(r.rows[0].n, t).toBe(0);
    }
    expect(await fails(`select * from ft_push_subscriptions`)).toMatch(/permission denied/);
    expect(await fails(`select api_key_enc from garmin_connections`)).toMatch(/permission denied/);
    expect(await fails(`insert into coach_messages (user_id, role, content) values ('owner','user','x')`)).toMatch(/row-level security|permission/);
    expect(await fails(`select complete_session('${S(1)}')`)).toMatch(/permission denied|not authenticated/);
    expect(await fails(`select start_session('${S(1)}')`)).toMatch(/permission denied|not authenticated/);
  });

  it('owner cannot delete coach messages (cap reset) or rewrite the cached insight', async () => {
    await as('owner');
    await db.query(`delete from coach_messages`);
    await db.query(`update daily_insights set text = 'y'`);
    await db.exec('reset role');
    expect((await db.query<{ n: number }>(`select count(*)::int n from coach_messages`)).rows[0].n).toBe(1);
    expect((await db.query<{ text: string }>(`select text from daily_insights`)).rows[0].text).toBe('x');
  });

  it('extra sets beyond the prescription do not complete a session', async () => {
    await as('owner');
    await db.exec(`insert into set_logs (session_exercise_id,user_id,set_index,weight_kg,reps,done) values ('${E(1)}','owner',0,40,10,true),('${E(1)}','owner',5,40,10,true)`);
    expect(await fails(`select complete_session('${S(1)}')`)).toMatch(/session_incomplete/);
  });
});

describe('value ranges: the set grid never produces a value the database refuses', () => {
  // The DB stores weight numeric(6,2) and reps integer; the grid clamps (lib/program/inputs.ts).
  it('a 10000 kg typo is clamped to a storable weight that the database accepts', async () => {
    const kg = parseSetValue('10000', 'weight_kg');
    expect(kg).toBe(LIMITS.weight_kg);
    await as('owner');
    expect(await fails(`insert into set_logs (session_exercise_id,user_id,set_index,weight_kg,reps,done) values ('${E(1)}','owner',1,${kg},10,true)`)).toBeNull();
  });

  it('3000000000 reps from a stuck key are clamped to a storable integer', async () => {
    const reps = parseSetValue('3000000000', 'reps');
    expect(reps).toBe(LIMITS.reps);
    await as('owner');
    expect(await fails(`insert into set_logs (session_exercise_id,user_id,set_index,weight_kg,reps,done) values ('${E(1)}','owner',2,40,${reps},true)`)).toBeNull();
  });
});
