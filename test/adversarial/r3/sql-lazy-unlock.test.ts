// @vitest-environment node
/**
 * Adversarial r3: the server only applies the calendar unlock lazily (when a
 * client calls refresh_unlocks / a write runs _refresh_unlocks). The reminders
 * cron reads program_sessions.status directly, so it sees yesterday's state.
 * This proves the DB side of the "no reminder the morning after training" bug.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const FILES = fs.readdirSync(MIGRATIONS).filter((f) => f.startsWith('2026111')).sort();
const P = '00000000-0000-4000-8000-0000000003c1';
const S = (n: number) => `00000000-0000-4000-8000-0000000004c${n}`;
const E = (n: number) => `00000000-0000-4000-8000-0000000005c${n}`;
let db: PGlite;
const as = (sub: string) => db.exec(`reset role; set request.jwt.claims = '${JSON.stringify({ sub, role: 'authenticated' })}'; set role authenticated;`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  for (const f of FILES) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  await as('owner');
  await db.exec(`insert into user_settings (user_id, timezone, unlock_rule) values ('owner', 'UTC', 'next_calendar_day')`);
  await db.exec(`insert into programs (id,user_id,name,template_key,sessions_per_week,weeks) values ('${P}','owner','p','t',4,1)`);
  for (const n of [1, 2]) {
    await db.exec(`insert into program_sessions (id,program_id,user_id,seq,week,template_key,title) values ('${S(n)}','${P}','owner',${n},1,'k','T${n}')`);
    await db.exec(`insert into session_exercises (id,session_id,user_id,exercise_id,prescribed_exercise_id,position,sets,rep_lo,rep_hi) values ('${E(n)}','${S(n)}','owner','bench','bench',0,1,8,10)`);
  }
  await db.query(`select start_session('${S(1)}')`);
  await db.exec(`insert into set_logs (session_exercise_id,user_id,set_index,weight_kg,reps,done) values ('${E(1)}','owner',0,40,10,true)`);
  await db.query(`select complete_session('${S(1)}')`);
}, 60_000);

describe('lazy calendar unlock vs. the reminders cron', () => {
  it('a day after completing session 1, the row the cron reads for session 2 is still "locked"', async () => {
    await db.exec('reset role');
    // Simulate "the next morning": session 1 was completed yesterday.
    await db.exec(`update program_sessions set completed_at = now() - interval '1 day' where id = '${S(1)}'`);
    const before = await db.query<{ status: string }>(`select status from program_sessions where id = '${S(2)}'`);
    // What /api/cron/reminders sees: .in('status', ['up_next','in_progress']) → nothing → no push.
    expect(before.rows[0].status).toBe('locked');
    // It is only up_next once someone runs the unlock (the cron never does).
    await db.query(`select public._refresh_unlocks('owner')`);
    const after = await db.query<{ status: string }>(`select status from program_sessions where id = '${S(2)}'`);
    expect(after.rows[0].status).toBe('up_next');
  });
});
