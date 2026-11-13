-- Explicit Start, and Reset for an accidental start.
-- Also replaces _set_logs_guard: clients can no longer start a session by
-- writing a set (raises not_started); only start_session or trusted writers can.
-- Mirrors lib/program/unlock.ts `start` / `reset` events.
--
--   start_session(id):  up_next → in_progress, started_at = client time (clamped
--                       to now). No-op when already in progress or complete.
--   reset_session(id):  in_progress → up_next, started_at = null, and the
--                       session's set_logs are deleted. Refuses a complete
--                       session; no-op when already up next.
-- Both refuse locked sessions. Clients still have no privilege on status.

create or replace function public.start_session(session_id uuid, client_started_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid     text := public.requesting_user_id();
  s         public.program_sessions;
  v_prev_at timestamptz;
begin
  if v_uid is null and not public._is_trusted() then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into s from public.program_sessions where id = start_session.session_id for update;
  if not found or (v_uid is not null and s.user_id <> v_uid) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if s.status = 'locked' then
    perform public._refresh_unlocks(s.user_id);
    select * into s from public.program_sessions where id = start_session.session_id;
    if s.status = 'locked' then
      raise exception 'session_locked' using errcode = 'P0001', detail = 'Complete the previous session first.';
    end if;
  end if;

  if s.status = 'up_next' then
    -- Offline starts keep their real time, clamped to [unlock / previous completion, now].
    select max(completed_at) into v_prev_at from public.program_sessions
      where program_id = s.program_id and seq < s.seq;
    update public.program_sessions
      set status = 'in_progress',
          started_at = least(now(), greatest(coalesce(client_started_at, now()),
                                             coalesce(s.unlocked_at, '-infinity'::timestamptz),
                                             coalesce(v_prev_at, '-infinity'::timestamptz))),
          updated_at = now()
      where id = s.id
      returning * into s;
  end if;

  return jsonb_build_object('session_id', s.id, 'status', s.status, 'started_at', s.started_at);
end $$;

create or replace function public.reset_session(session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_uid     text := public.requesting_user_id();
  s         public.program_sessions;
  v_deleted integer := 0;
begin
  if v_uid is null and not public._is_trusted() then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into s from public.program_sessions where id = reset_session.session_id for update;
  if not found or (v_uid is not null and s.user_id <> v_uid) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  if s.status = 'complete' then
    raise exception 'session_complete' using errcode = 'P0001', detail = 'A completed session can''t be reset.';
  end if;
  if s.status = 'locked' then
    raise exception 'session_locked' using errcode = 'P0001';
  end if;

  if s.status = 'in_progress' then
    delete from public.set_logs where set_logs.session_id = s.id;
    get diagnostics v_deleted = row_count;
    update public.program_sessions
      set status = 'up_next', started_at = null, updated_at = now()
      where id = s.id
      returning * into s;
  end if;

  return jsonb_build_object('session_id', s.id, 'status', s.status, 'deleted_sets', v_deleted);
end $$;

-- ─── set_logs guard: refuse client writes before Start ───
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
  -- Only Start (start_session) starts a session. A client write into an up-next
  -- session is stale (e.g. queued before a Reset) and must not restart it.
  -- Trusted writers (Garmin watch sync) may still start it.
  if v_status = 'up_next' and not v_trusted then
    raise exception 'not_started' using errcode = 'P0001', detail = 'Tap Start first.';
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


revoke execute on function public.start_session(uuid, timestamptz) from public, anon;
revoke execute on function public.reset_session(uuid) from public, anon;
grant execute on function public.start_session(uuid, timestamptz) to authenticated;
grant execute on function public.reset_session(uuid) to authenticated;
