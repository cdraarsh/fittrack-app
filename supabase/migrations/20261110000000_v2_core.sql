-- FitTrack v2 — core schema: exercise library, numbered programs, set logging,
-- locked progression. Source of truth for the data model: PLAN_V2.md.
--
-- Auth: Clerk session JWT (third-party auth). user_id is text = JWT `sub`.
-- Every user table has RLS keyed to public.requesting_user_id().
--
-- Progression (mirrors lib/program/unlock.ts):
--   locked → up_next       previous session complete AND (rule 'immediate' OR a
--                          later local calendar day, in user_settings.timezone)
--   up_next → in_progress  first set_logs write for the session (trigger)
--   → complete             only via complete_session(), which checks every
--                          prescribed working set is done
-- Clients can never write program_sessions.status: column privileges exclude it
-- and inserts are normalised by trigger.

-- ─── Helpers ──────────────────────────────────────────────────────────────────
create or replace function public.requesting_user_id() returns text
language sql stable as $$ select nullif(auth.jwt()->>'sub','') $$;

-- True for the service role (server jobs, e.g. Garmin sync) and for direct
-- database sessions without a JWT (migrations, psql).
create or replace function public._is_trusted() returns boolean
language sql stable as $$ select coalesce(auth.jwt()->>'role', 'service_role') = 'service_role' $$;

-- Bump updated_at unless the writer supplied a new value (clients send their own
-- updated_at for last-write-wins).
create or replace function public._touch_updated_at() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := coalesce(new.updated_at, now());
  elsif new.updated_at is not distinct from old.updated_at then
    new.updated_at := now();
  end if;
  return new;
end $$;

-- Last-write-wins: silently ignore an update older than the stored row.
create or replace function public._lww_guard() returns trigger
language plpgsql as $$
begin
  if new.updated_at is not null and old.updated_at is not null and new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end $$;

-- ─── exercises (shared library, read-only for clients) ───────────────────────
create table if not exists public.exercises (
  id              text primary key,
  name            text not null unique,
  pattern         text not null,
  equipment       text not null,
  is_timed        boolean not null default false,
  rep_lo          integer not null check (rep_lo > 0),
  rep_hi          integer not null check (rep_hi >= rep_lo),
  swap_group      text not null,
  garmin_category text,            -- FIT SDK exercise_category name, snake_case
  garmin_subtype  text,            -- FIT SDK <category>_exercise_name, snake_case
  cue             text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists exercises_swap_group_idx on public.exercises (swap_group);

alter table public.exercises enable row level security;
revoke all on public.exercises from anon, authenticated;
grant select on public.exercises to authenticated;
drop policy if exists exercises_read on public.exercises;
create policy exercises_read on public.exercises for select to authenticated using (true);

-- ─── user_settings ────────────────────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id        text primary key default public.requesting_user_id(),
  preferred_days smallint[] not null default '{1,2,4,5}'
                 check (preferred_days <@ array[0,1,2,3,4,5,6]::smallint[]),   -- 0 = Sunday
  units          text not null default 'kg' check (units in ('kg', 'lb')),
  timezone       text not null default 'UTC',
  unlock_rule    text not null default 'next_calendar_day'
                 check (unlock_rule in ('immediate', 'next_calendar_day')),
  sound_enabled  boolean not null default true,
  sound_volume   real not null default 0.8 check (sound_volume between 0 and 1),
  coach_daily_cap integer default 20 check (coach_daily_cap is null or coach_daily_cap >= 0), -- read by /api/coach
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function public._user_settings_validate() returns trigger
language plpgsql as $$
begin
  perform now() at time zone new.timezone;   -- raises on an unknown zone
  return new;
end $$;

-- ─── programs ─────────────────────────────────────────────────────────────────
create table if not exists public.programs (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null default public.requesting_user_id(),
  name              text not null,
  template_key      text not null,
  start_date        date not null default current_date,
  sessions_per_week integer not null check (sessions_per_week between 1 and 7),
  weeks             integer not null check (weeks between 1 and 52),
  status            text not null default 'active' check (status in ('active', 'complete', 'archived')),
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists programs_one_active_per_user on public.programs (user_id) where status = 'active';

-- ─── program_sessions ─────────────────────────────────────────────────────────
create table if not exists public.program_sessions (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.programs (id) on delete cascade,
  user_id           text not null default public.requesting_user_id(),
  seq               integer not null check (seq >= 1),
  week              integer not null check (week >= 1),
  template_key      text not null,
  title             text not null,
  phase             text not null default '',
  is_deload         boolean not null default false,
  cardio_target     text,
  status            text not null default 'locked'
                    check (status in ('locked', 'up_next', 'in_progress', 'complete')),
  unlocked_at       timestamptz,
  started_at        timestamptz,
  completed_at      timestamptz,
  cardio_done       boolean not null default false,
  cardio_duration_s integer check (cardio_duration_s >= 0),
  cardio_avg_hr     integer check (cardio_avg_hr > 0),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (program_id, seq)
);
create index if not exists program_sessions_user_status_idx on public.program_sessions (user_id, status);

-- ─── session_exercises ────────────────────────────────────────────────────────
create table if not exists public.session_exercises (
  id                     uuid primary key default gen_random_uuid(),
  session_id             uuid not null references public.program_sessions (id) on delete cascade,
  user_id                text not null default public.requesting_user_id(),
  exercise_id            text not null references public.exercises (id),
  prescribed_exercise_id text not null references public.exercises (id),
  position               integer not null check (position >= 0),
  sets                   integer not null check (sets between 1 and 20),
  rep_lo                 integer not null check (rep_lo > 0),
  rep_hi                 integer not null check (rep_hi >= rep_lo),
  rest_s                 integer not null default 90 check (rest_s >= 0),
  target_kg              numeric(6,2) check (target_kg >= 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (session_id, position)
);
create index if not exists session_exercises_user_exercise_idx on public.session_exercises (user_id, exercise_id);

-- ─── set_logs ─────────────────────────────────────────────────────────────────
create table if not exists public.set_logs (
  id                  uuid primary key default gen_random_uuid(),   -- client-generated
  session_exercise_id uuid not null references public.session_exercises (id) on delete cascade,
  session_id          uuid not null references public.program_sessions (id) on delete cascade, -- set by trigger
  user_id             text not null default public.requesting_user_id(),
  set_index           integer not null check (set_index between 0 and 49),
  weight_kg           numeric(6,2) check (weight_kg >= 0),
  reps                integer check (reps >= 0),
  seconds             integer check (seconds >= 0),
  rpe                 numeric(3,1) check (rpe between 1 and 10),
  done                boolean not null default false,
  source              text not null default 'app' check (source in ('app', 'watch')),
  garmin_activity_id  bigint,
  logged_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (session_exercise_id, set_index)
);
create index if not exists set_logs_session_idx on public.set_logs (session_id);
create index if not exists set_logs_user_updated_idx on public.set_logs (user_id, updated_at);

-- ─── body_weights ─────────────────────────────────────────────────────────────
create table if not exists public.body_weights (
  user_id    text not null default public.requesting_user_id(),
  date       date not null,
  kg         numeric(5,2) not null check (kg > 0 and kg < 500),
  source     text not null default 'app' check (source in ('app', 'watch')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ─── Progression functions ───────────────────────────────────────────────────

-- Unlock the first non-complete session of each active program when the rule
-- allows; relock anything open beyond it; mark fully complete programs.
-- Internal: not executable by clients.
create or replace function public._refresh_unlocks(p_user text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_rule text;
  v_tz   text;
  p      record;
  f      public.program_sessions;
  prev   public.program_sessions;
begin
  select coalesce(us.unlock_rule, 'next_calendar_day'), coalesce(us.timezone, 'UTC')
    into v_rule, v_tz
    from (select 1) one left join public.user_settings us on us.user_id = p_user;

  for p in select id from public.programs where user_id = p_user and status = 'active' for update loop
    select * into f from public.program_sessions
      where program_id = p.id and status <> 'complete' order by seq limit 1 for update;

    if not found then
      update public.programs set status = 'complete', completed_at = now(), updated_at = now() where id = p.id;
      continue;
    end if;

    if f.status = 'locked' then
      select * into prev from public.program_sessions where program_id = p.id and seq < f.seq order by seq desc limit 1;
      if not found
         or (prev.status = 'complete' and prev.completed_at is not null and (
               v_rule = 'immediate'
               or (now() at time zone v_tz)::date > (prev.completed_at at time zone v_tz)::date)) then
        update public.program_sessions set status = 'up_next', unlocked_at = now(), updated_at = now() where id = f.id;
      end if;
    end if;

    update public.program_sessions set status = 'locked', unlocked_at = null, updated_at = now()
      where program_id = p.id and seq > f.seq and status in ('up_next', 'in_progress');
  end loop;
end $$;

-- Client-callable: re-evaluate unlocks (app open / after sync). Returns the
-- session the user can work on now, if any.
create or replace function public.refresh_unlocks() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := public.requesting_user_id();
  cur   public.program_sessions;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  perform public._refresh_unlocks(v_uid);
  select s.* into cur from public.program_sessions s join public.programs p on p.id = s.program_id
    where s.user_id = v_uid and p.status = 'active' and s.status in ('up_next', 'in_progress')
    order by s.seq limit 1;
  return jsonb_build_object('current_session_id', cur.id, 'status', cur.status, 'seq', cur.seq);
end $$;

-- Complete a session. Refuses unless every prescribed working set
-- (set_index 0..sets-1 of each session exercise) is done with reps or seconds.
-- `client_completed_at` lets an offline completion keep its real time (clamped
-- to [previous completion, now]) so the calendar rule matches the phone.
create or replace function public.complete_session(session_id uuid, client_completed_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid     text := public.requesting_user_id();
  s         public.program_sessions;
  v_prev_at timestamptz;
  v_missing integer;
  v_ts      timestamptz;
  nxt       public.program_sessions;
begin
  if v_uid is null and not public._is_trusted() then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into s from public.program_sessions where id = complete_session.session_id for update;
  if not found or (v_uid is not null and s.user_id <> v_uid) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if s.status = 'locked' then
    perform public._refresh_unlocks(s.user_id);
    select * into s from public.program_sessions where id = complete_session.session_id;
    if s.status = 'locked' then
      raise exception 'session_locked' using errcode = 'P0001', detail = 'Complete the previous session first.';
    end if;
  end if;

  if s.status <> 'complete' then
    select count(*) into v_missing
      from public.session_exercises se
      cross join lateral generate_series(0, se.sets - 1) as i(idx)
      where se.session_id = s.id
        and not exists (
          select 1 from public.set_logs l
          where l.session_exercise_id = se.id and l.set_index = i.idx and l.done
            and (coalesce(l.reps, 0) > 0 or coalesce(l.seconds, 0) > 0));
    if v_missing > 0 then
      raise exception 'session_incomplete' using errcode = 'P0001',
        detail = format('%s prescribed working set(s) not done', v_missing);
    end if;

    select max(completed_at) into v_prev_at from public.program_sessions
      where program_id = s.program_id and seq < s.seq;
    v_ts := least(now(), greatest(coalesce(client_completed_at, now()), coalesce(v_prev_at, '-infinity'::timestamptz)));

    update public.program_sessions
      set status = 'complete', completed_at = v_ts, started_at = coalesce(started_at, v_ts), updated_at = now()
      where id = s.id;
    perform public._refresh_unlocks(s.user_id);
    select * into s from public.program_sessions where id = s.id;
  end if;

  select * into nxt from public.program_sessions where program_id = s.program_id and seq = s.seq + 1;
  return jsonb_build_object(
    'session_id', s.id,
    'status', s.status,
    'completed_at', s.completed_at,
    'next_session_id', nxt.id,
    'next_status', nxt.status,
    'program_complete', nxt.id is null
  );
end $$;

-- ─── Triggers ─────────────────────────────────────────────────────────────────

-- programs: clients may only create active programs.
create or replace function public._programs_before_insert() returns trigger
language plpgsql as $$
begin
  if not public._is_trusted() then
    new.status := 'active';
    new.completed_at := null;
  end if;
  return new;
end $$;

-- program_sessions: status/timestamps are server-controlled. On insert the
-- first session is up_next, the rest locked (same as lib/program/generate.ts).
create or replace function public._program_sessions_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_owner text;
begin
  select user_id into v_owner from public.programs where id = new.program_id;
  if v_owner is null or v_owner <> new.user_id then
    raise exception 'program not found' using errcode = 'P0002';
  end if;
  if not public._is_trusted() then
    new.status := case when new.seq = 1 then 'up_next' else 'locked' end;
    new.unlocked_at := case when new.seq = 1 then now() else null end;
    new.started_at := null;
    new.completed_at := null;
  end if;
  return new;
end $$;

-- session_exercises: ownership; swaps only within the swap group, only while
-- the session is up_next / in_progress (future sessions are preview-only).
create or replace function public._session_exercises_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner  text;
  v_status text;
  v_g_new  text;
  v_g_orig text;
begin
  select user_id, status into v_owner, v_status from public.program_sessions where id = new.session_id;
  if v_owner is null or v_owner <> new.user_id then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if tg_op = 'INSERT' then
    new.prescribed_exercise_id := coalesce(new.prescribed_exercise_id, new.exercise_id);
  elsif new.session_id <> old.session_id or new.position <> old.position
        or new.prescribed_exercise_id <> old.prescribed_exercise_id or new.user_id <> old.user_id then
    raise exception 'immutable column' using errcode = 'P0001';
  end if;

  if new.exercise_id <> new.prescribed_exercise_id then
    select swap_group into v_g_new from public.exercises where id = new.exercise_id;
    select swap_group into v_g_orig from public.exercises where id = new.prescribed_exercise_id;
    if v_g_new is distinct from v_g_orig then
      raise exception 'swap_outside_group' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.exercise_id <> old.exercise_id
     and v_status not in ('up_next', 'in_progress') and not public._is_trusted() then
    raise exception 'session_not_active' using errcode = 'P0001', detail = 'Swaps are only allowed on the current session.';
  end if;
  return new;
end $$;

-- set_logs guard:
--  * last-write-wins by updated_at (stale updates ignored)
--  * watch data only fills empty fields
--  * writes only to up_next / in_progress sessions (locked → refused after an
--    unlock re-check); on a complete session only typo edits of done rows, and
--    done can't be unticked
--  * first write moves up_next → in_progress
--  * an insert that collides on (session_exercise_id, set_index) with another
--    id (e.g. a watch-filled row) becomes an update of that row
create or replace function public._set_logs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  se        public.session_exercises;
  v_status  text;
  v_trusted boolean := public._is_trusted();
  v_other   uuid;
begin
  if tg_op = 'UPDATE' then
    if new.session_exercise_id <> old.session_exercise_id or new.set_index <> old.set_index or new.user_id <> old.user_id then
      raise exception 'immutable column' using errcode = 'P0001';
    end if;
    if new.updated_at < old.updated_at then
      return null;                                     -- stale write: last write wins
    end if;
    if new.source = 'watch' and old.source = 'app' then
      if old.weight_kg is not null or old.reps is not null or old.seconds is not null then
        new.source := 'app';
      end if;
      new.weight_kg := coalesce(old.weight_kg, new.weight_kg);
      new.reps      := coalesce(old.reps, new.reps);
      new.seconds   := coalesce(old.seconds, new.seconds);
      new.rpe       := coalesce(old.rpe, new.rpe);
      new.done      := old.done or new.done;
    end if;
  end if;

  select * into se from public.session_exercises where id = new.session_exercise_id;
  if not found or se.user_id <> new.user_id then
    raise exception 'session exercise not found' using errcode = 'P0002';
  end if;
  new.session_id := se.session_id;

  select status into v_status from public.program_sessions where id = se.session_id for update;

  if v_status = 'locked' and not v_trusted then
    perform public._refresh_unlocks(se.user_id);
    select status into v_status from public.program_sessions where id = se.session_id;
  end if;
  if v_status = 'locked' and not v_trusted then
    raise exception 'session_locked' using errcode = 'P0001';
  end if;

  if v_status = 'complete' then
    if tg_op = 'UPDATE' and old.done and not new.done then
      raise exception 'cannot_untick_completed_set' using errcode = 'P0001';
    end if;
    if not v_trusted then
      if tg_op = 'INSERT' then
        -- only an idempotent re-send of an existing done row (it will turn into an update)
        if not new.done or not exists (
             select 1 from public.set_logs where done
               and (id = new.id or (session_exercise_id = new.session_exercise_id and set_index = new.set_index))) then
          raise exception 'session_complete' using errcode = 'P0001';
        end if;
      elsif not old.done then
        raise exception 'session_complete' using errcode = 'P0001';
      end if;
    end if;
    if new.done and coalesce(new.reps, 0) = 0 and coalesce(new.seconds, 0) = 0 then
      raise exception 'done_set_needs_reps_or_seconds' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' then
    select id into v_other from public.set_logs
      where session_exercise_id = new.session_exercise_id and set_index = new.set_index and id <> new.id;
    if v_other is not null and not exists (select 1 from public.set_logs where id = new.id) then
      update public.set_logs set
        weight_kg = new.weight_kg, reps = new.reps, seconds = new.seconds, rpe = new.rpe,
        done = new.done, source = new.source, garmin_activity_id = coalesce(new.garmin_activity_id, garmin_activity_id),
        logged_at = new.logged_at, updated_at = new.updated_at
        where id = v_other;
      return null;
    end if;
  end if;

  if new.done and new.logged_at is null then
    new.logged_at := now();
  end if;

  if v_status = 'up_next' then
    update public.program_sessions
      set status = 'in_progress', started_at = coalesce(started_at, least(now(), coalesce(new.logged_at, now()))), updated_at = now()
      where id = se.session_id;
  end if;
  return new;
end $$;

drop trigger if exists user_settings_validate on public.user_settings;
create trigger user_settings_validate before insert or update on public.user_settings
  for each row execute function public._user_settings_validate();

drop trigger if exists programs_before_insert on public.programs;
create trigger programs_before_insert before insert on public.programs
  for each row execute function public._programs_before_insert();

drop trigger if exists program_sessions_before_insert on public.program_sessions;
create trigger program_sessions_before_insert before insert on public.program_sessions
  for each row execute function public._program_sessions_before_insert();

drop trigger if exists session_exercises_guard on public.session_exercises;
create trigger session_exercises_guard before insert or update on public.session_exercises
  for each row execute function public._session_exercises_guard();

drop trigger if exists set_logs_guard on public.set_logs;
create trigger set_logs_guard before insert or update on public.set_logs
  for each row execute function public._set_logs_guard();

-- LWW on simple client-owned rows
drop trigger if exists user_settings_lww on public.user_settings;
create trigger user_settings_lww before update on public.user_settings
  for each row execute function public._lww_guard();
drop trigger if exists body_weights_lww on public.body_weights;
create trigger body_weights_lww before update on public.body_weights
  for each row execute function public._lww_guard();

-- updated_at bookkeeping (named zz_ so it runs after the guards)
do $$
declare t text;
begin
  foreach t in array array['exercises','user_settings','programs','program_sessions','session_exercises','set_logs','body_weights'] loop
    execute format('drop trigger if exists zz_touch_updated_at on public.%I', t);
    execute format('create trigger zz_touch_updated_at before insert or update on public.%I for each row execute function public._touch_updated_at()', t);
  end loop;
end $$;

-- ─── RLS + privileges ─────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['user_settings','programs','program_sessions','session_exercises','set_logs','body_weights'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = public.requesting_user_id())', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = public.requesting_user_id())', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = public.requesting_user_id()) with check (user_id = public.requesting_user_id())', t || '_update_own', t);
  end loop;
end $$;

drop policy if exists body_weights_delete_own on public.body_weights;
create policy body_weights_delete_own on public.body_weights for delete to authenticated
  using (user_id = public.requesting_user_id());

-- Column privileges: clients never touch status / unlock / completion columns.
grant select, insert on public.user_settings, public.programs, public.program_sessions,
  public.session_exercises, public.set_logs, public.body_weights to authenticated;
grant update (preferred_days, units, timezone, unlock_rule, sound_enabled, sound_volume, coach_daily_cap, updated_at)
  on public.user_settings to authenticated;
grant update (name, updated_at) on public.programs to authenticated;
grant update (cardio_done, cardio_duration_s, cardio_avg_hr, notes, updated_at)
  on public.program_sessions to authenticated;
grant update (exercise_id, updated_at) on public.session_exercises to authenticated;
grant update (weight_kg, reps, seconds, rpe, done, source, garmin_activity_id, logged_at, updated_at)
  on public.set_logs to authenticated;
grant update (kg, source, updated_at), delete on public.body_weights to authenticated;

-- Functions: only the two public entry points are callable by clients.
revoke execute on function public._refresh_unlocks(text) from public, anon, authenticated;
revoke execute on function public.refresh_unlocks() from public, anon;
revoke execute on function public.complete_session(uuid, timestamptz) from public, anon;
grant execute on function public.refresh_unlocks() to authenticated;
grant execute on function public.complete_session(uuid, timestamptz) to authenticated;
