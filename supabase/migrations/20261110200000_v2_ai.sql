-- FitTrack v2 — AI track: daily insight cache + coach chat log.
-- Depends on public.requesting_user_id() (Clerk `sub` as text), defined in the
-- foundation track's core migration, which must sort before this file.

-- ─── daily_insights ──────────────────────────────────────────────────────────
-- One row per user per day; the insight route reads this before calling a model,
-- so a user costs at most one model request per day.
create table if not exists public.daily_insights (
  user_id     text        not null default public.requesting_user_id(),
  date        date        not null,
  text        text        not null,
  stats_pack  jsonb       not null default '{}'::jsonb,
  model       text        not null,             -- 'groq:openai/gpt-oss-120b' | 'rules:error' | ...
  created_at  timestamptz not null default now(),
  primary key (user_id, date)                   -- = unique(user_id, date)
);

alter table public.daily_insights enable row level security;

drop policy if exists daily_insights_select_own on public.daily_insights;
create policy daily_insights_select_own on public.daily_insights
  for select using (user_id = public.requesting_user_id());

drop policy if exists daily_insights_insert_own on public.daily_insights;
create policy daily_insights_insert_own on public.daily_insights
  for insert with check (user_id = public.requesting_user_id());

-- No update/delete policies: a cached row is final for the day, so a client
-- can't delete it to force another model request (writes use ON CONFLICT DO NOTHING).

-- ─── coach_messages ──────────────────────────────────────────────────────────
create table if not exists public.coach_messages (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null default public.requesting_user_id(),
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null check (char_length(content) <= 8000),
  tool_calls  jsonb,                            -- assistant turns: {model, calls: [{toolName, input}]}
  created_at  timestamptz not null default now()
);

create index if not exists coach_messages_user_created_idx
  on public.coach_messages (user_id, created_at desc);

alter table public.coach_messages enable row level security;

drop policy if exists coach_messages_select_own on public.coach_messages;
create policy coach_messages_select_own on public.coach_messages
  for select using (user_id = public.requesting_user_id());

drop policy if exists coach_messages_insert_own on public.coach_messages;
create policy coach_messages_insert_own on public.coach_messages
  for insert with check (user_id = public.requesting_user_id());

-- No update/delete policies: messages are immutable, and the daily cap counts
-- today's user rows, so letting users delete rows would let them reset it.
