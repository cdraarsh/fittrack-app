-- Web push subscriptions (one per owner). v1 created this table by hand, so a
-- fresh v2 database never got it. Server-only: the push routes and the
-- reminders cron use the service role; clients get no access.
create table if not exists public.ft_push_subscriptions (
  user_id         text primary key default public.requesting_user_id(),
  push_type       text not null default 'web' check (push_type in ('web', 'native')),
  subscription    jsonb not null,
  native_token    text,
  native_platform text check (native_platform in ('android', 'ios') or native_platform is null),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.ft_push_subscriptions enable row level security;
revoke all on public.ft_push_subscriptions from anon, authenticated;
