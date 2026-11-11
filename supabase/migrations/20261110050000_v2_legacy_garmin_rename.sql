-- An older prototype left a `garmin_activities` table with a different shape
-- (started_at, activity_type, duration_seconds, ...). v2 needs that name, so
-- move the old table aside — nothing is deleted. Only runs when the existing
-- table has the legacy shape; a no-op on a fresh database or on re-run.
do $$
declare
  r record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'garmin_activities' and column_name = 'started_at'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'garmin_activities' and column_name = 'start_time'
  ) then
    if to_regclass('public.garmin_activities_legacy') is not null then
      raise exception 'garmin_activities_legacy already exists; resolve manually';
    end if;

    alter table public.garmin_activities rename to garmin_activities_legacy;

    -- Renaming a table keeps its constraint/index/sequence names, which would
    -- collide with the ones v2 creates (e.g. garmin_activities_pkey).
    for r in
      select conname from pg_constraint
      where conrelid = 'public.garmin_activities_legacy'::regclass and conname like 'garmin_activities%'
    loop
      execute format('alter table public.garmin_activities_legacy rename constraint %I to %I',
        r.conname, 'garmin_activities_legacy' || substr(r.conname, length('garmin_activities') + 1));
    end loop;

    for r in
      select i.relname from pg_index x join pg_class i on i.oid = x.indexrelid
      where x.indrelid = 'public.garmin_activities_legacy'::regclass and i.relname like 'garmin_activities%'
    loop
      execute format('alter index public.%I rename to %I',
        r.relname, 'garmin_activities_legacy' || substr(r.relname, length('garmin_activities') + 1));
    end loop;

    for r in
      select s.relname from pg_class s
      join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
      where s.relkind = 'S' and d.refobjid = 'public.garmin_activities_legacy'::regclass and s.relname like 'garmin_activities%'
    loop
      execute format('alter sequence public.%I rename to %I',
        r.relname, 'garmin_activities_legacy' || substr(r.relname, length('garmin_activities') + 1));
    end loop;
  end if;
end $$;
