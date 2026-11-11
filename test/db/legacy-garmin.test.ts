// @vitest-environment node
/**
 * The real Supabase project already had a prototype `garmin_activities` with a
 * different shape. All v2 migrations (except the held-back drop) must apply on
 * top of it, keep the old rows, and create the v2 tables.
 */
import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');
const V2 = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.startsWith('2026111') && !f.includes('drop_parked'))
  .sort();

async function fresh() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  return db;
}

async function columns(db: PGlite, table: string) {
  const r = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
    [table],
  );
  return r.rows.map((x) => x.column_name);
}

describe('v2 migrations on the prototype database', () => {
  it('moves the legacy garmin_activities aside and applies everything', async () => {
    const db = await fresh();
    await db.exec(`
      create table public.garmin_activities (
        id bigserial primary key, user_id text, garmin_activity_id bigint unique, activity_type text,
        started_at timestamptz, duration_seconds int, distance_meters numeric, calories int, avg_hr int, max_hr int,
        hr_zones jsonb, raw_data jsonb, matched_session_id text, created_at timestamptz default now()
      );
      create index garmin_activities_user_started on public.garmin_activities (user_id, started_at);
      insert into public.garmin_activities (user_id, garmin_activity_id, activity_type, started_at) values ('old', 1, 'running', now());
    `);
    for (const f of V2) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));

    expect(await columns(db, 'garmin_activities_legacy')).toContain('started_at');
    expect((await db.query(`select count(*)::int as n from garmin_activities_legacy`)).rows).toEqual([{ n: 1 }]);
    expect(await columns(db, 'garmin_activities')).toEqual(expect.arrayContaining(['start_time', 'match_status', 'unmatched_sets']));
    for (const t of ['programs', 'set_logs', 'garmin_dailies', 'daily_insights', 'coach_messages', 'ft_push_subscriptions']) {
      expect((await columns(db, t)).length, t).toBeGreaterThan(0);
    }

    // Re-running is a no-op (legacy table is left alone, v2 table untouched).
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, '20261110050000_v2_legacy_garmin_rename.sql'), 'utf8'));
    expect(await columns(db, 'garmin_activities')).toContain('start_time');
  }, 60_000);

  it('applies cleanly on an empty database', async () => {
    const db = await fresh();
    for (const f of V2) await db.exec(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
    expect(await columns(db, 'garmin_activities_legacy')).toEqual([]);
    expect(await columns(db, 'garmin_activities')).toContain('start_time');
  }, 60_000);
});
