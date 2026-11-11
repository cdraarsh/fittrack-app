-- FitTrack v2 — drop parked v1 features (see PLAN_V2.md "Park").
--
-- * ft_foods: nutrition food database (reference data only) → dropped.
-- * ft_push_subscriptions: web push stays; the native (FCM/APNs) columns go.
--
-- Left in place on purpose (user data; v2 starts fresh and no longer reads them):
--   ft_days, ft_settings, ft_weights, ft_photos (+ storage bucket).
-- Drop them by hand once v2 is verified and v1 (tag v1.7.0) is retired:
--   drop table if exists public.ft_days, public.ft_settings, public.ft_weights, public.ft_photos;

drop table if exists public.ft_foods;

do $$
begin
  if to_regclass('public.ft_push_subscriptions') is not null then
    delete from public.ft_push_subscriptions where push_type = 'native';
    drop index if exists public.idx_push_subscriptions_native;
    alter table public.ft_push_subscriptions
      drop column if exists native_token,
      drop column if exists native_platform;
  end if;
end $$;
