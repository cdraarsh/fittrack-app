-- FitTrack v2 — Garmin Connect (Personal API) tables.
--
-- Depends on 20261110000000_v2_core.sql (foundation): public.requesting_user_id()
-- (Clerk JWT `sub` as text) and public.program_sessions(id uuid).
--
-- Writes happen only from the server with the service role (bypasses RLS).
-- Clients (Clerk JWT → `authenticated`) may read their own rows; the encrypted
-- API key column is never granted to anon/authenticated.

-- ─── garmin_connections ──────────────────────────────────────────────────────
create table if not exists public.garmin_connections (
  user_id              text primary key default public.requesting_user_id(),
  api_key_enc          text not null,           -- AES-256-GCM, see lib/garmin/crypto.ts
  key_last4            text,
  key_expires_at       timestamptz,             -- user-supplied (30/90/180/365 d); warn 7 d before
  last_synced_at       timestamptz,             -- sync watermark
  last_sync_attempt_at timestamptz,
  last_sync_status     text check (last_sync_status in ('ok', 'partial', 'auth_error', 'error')),
  last_sync_error      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.garmin_connections enable row level security;

revoke all on public.garmin_connections from anon, authenticated;
-- Column-level grant: everything EXCEPT api_key_enc.
grant select (user_id, key_last4, key_expires_at, last_synced_at, last_sync_attempt_at,
              last_sync_status, last_sync_error, created_at, updated_at)
  on public.garmin_connections to authenticated;

drop policy if exists garmin_connections_select_own on public.garmin_connections;
create policy garmin_connections_select_own on public.garmin_connections
  for select to authenticated
  using (user_id = public.requesting_user_id());

-- ─── garmin_activities ───────────────────────────────────────────────────────
create table if not exists public.garmin_activities (
  garmin_activity_id bigint primary key,
  user_id            text not null default public.requesting_user_id(),
  type               text not null,               -- Garmin typeKey, e.g. strength_training, running
  name               text,
  start_time         timestamptz not null,
  duration_s         integer,
  avg_hr             integer,
  fit_path           text,                        -- storage path in bucket garmin-fit
  matched_session_id uuid,                        -- FK to program_sessions added below (guarded)
  match_status       text not null default 'error'
                     check (match_status in ('matched', 'review', 'no_session', 'cardio_linked', 'error')),
  matched_count      integer not null default 0,
  unmatched_sets     jsonb not null default '[]'::jsonb,  -- "From watch, needs review" tray: [{set, reason}]
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists garmin_activities_user_start_idx
  on public.garmin_activities (user_id, start_time desc);
create index if not exists garmin_activities_session_idx
  on public.garmin_activities (matched_session_id) where matched_session_id is not null;
create index if not exists garmin_activities_review_idx
  on public.garmin_activities (user_id) where match_status = 'review';

alter table public.garmin_activities enable row level security;

revoke all on public.garmin_activities from anon, authenticated;
grant select on public.garmin_activities to authenticated;
-- The review tray UI may clear/trim leftovers once the user resolves them.
grant update (unmatched_sets, match_status, updated_at) on public.garmin_activities to authenticated;

drop policy if exists garmin_activities_select_own on public.garmin_activities;
create policy garmin_activities_select_own on public.garmin_activities
  for select to authenticated
  using (user_id = public.requesting_user_id());

drop policy if exists garmin_activities_update_own on public.garmin_activities;
create policy garmin_activities_update_own on public.garmin_activities
  for update to authenticated
  using (user_id = public.requesting_user_id())
  with check (user_id = public.requesting_user_id());

-- FK to the foundation's program_sessions, only if that table exists (it is
-- created by the earlier core migration; guarded so this file also applies on
-- a database without it, e.g. when migrations are run out of order).
do $$
begin
  if to_regclass('public.program_sessions') is not null
     and not exists (
       select 1 from pg_constraint where conname = 'garmin_activities_matched_session_fk'
     ) then
    alter table public.garmin_activities
      add constraint garmin_activities_matched_session_fk
      foreign key (matched_session_id) references public.program_sessions (id)
      on delete set null;
  end if;
end $$;

-- ─── garmin_dailies ──────────────────────────────────────────────────────────
create table if not exists public.garmin_dailies (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null default public.requesting_user_id(),
  date         date not null,
  sleep_s      integer,
  resting_hr   integer,
  hrv          numeric,       -- last-night average HRV (ms)
  body_battery integer,
  stress_avg   integer,
  steps        integer,
  raw          jsonb,         -- source payloads, for re-parsing once field names are verified
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, date)
);

alter table public.garmin_dailies enable row level security;

revoke all on public.garmin_dailies from anon, authenticated;
grant select on public.garmin_dailies to authenticated;

drop policy if exists garmin_dailies_select_own on public.garmin_dailies;
create policy garmin_dailies_select_own on public.garmin_dailies
  for select to authenticated
  using (user_id = public.requesting_user_id());

-- ─── Storage: private bucket for raw .FIT files (server writes only) ─────────
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
    values ('garmin-fit', 'garmin-fit', false)
    on conflict (id) do nothing;
  end if;
end $$;
