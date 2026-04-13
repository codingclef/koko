-- ============================================================
-- Authorized event mutation RPCs
-- Combines permission check + mutation into a single DB round trip,
-- replacing the separate family/calendar queries in the API routes.
-- ============================================================

-- ============================================================
-- create_event_authorized
-- Resolves actor's family, checks calendar access if needed,
-- then creates event + reminders atomically.
-- Raises: 'no_family' | 'forbidden'
-- ============================================================
create or replace function create_event_authorized(
  p_actor_user_id    uuid,
  p_calendar_id      uuid,
  p_title            text,
  p_description      text,
  p_start_at         timestamptz,
  p_end_at           timestamptz,
  p_is_all_day       boolean,
  p_reminder_minutes integer[]
)
returns setof events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_event     events;
begin
  select family_id into v_family_id
  from family_members
  where user_id = p_actor_user_id;

  if not found then
    raise exception 'no_family';
  end if;

  if p_calendar_id is not null then
    if not (
      exists(select 1 from calendars where id = p_calendar_id and family_id = v_family_id)
      and
      exists(select 1 from calendar_members where calendar_id = p_calendar_id and user_id = p_actor_user_id)
    ) then
      raise exception 'forbidden';
    end if;
  end if;

  insert into events (
    family_id, created_by, calendar_id,
    title, description,
    start_at, end_at, is_all_day
  )
  values (
    v_family_id, p_actor_user_id, p_calendar_id,
    p_title, p_description,
    p_start_at, p_end_at, p_is_all_day
  )
  returning * into v_event;

  if cardinality(p_reminder_minutes) > 0 then
    insert into event_reminders (event_id, remind_minutes_before)
    select v_event.id, unnest(p_reminder_minutes);
  end if;

  return next v_event;
end;
$$;

revoke execute on function create_event_authorized(
  uuid, uuid, text, text, timestamptz, timestamptz, boolean, integer[]
) from public, anon, authenticated;


-- ============================================================
-- update_event_authorized
-- Fetches existing event, checks write access, resolves partial
-- updates, and returns change metadata for push notifications.
--
-- Nullable-field convention:
--   p_title / p_start_at / p_is_all_day : NULL = keep existing (COALESCE)
--   p_description / p_end_at / p_calendar_id : paired with
--     p_has_* sentinel to distinguish "not provided" from "set to null"
--
-- Raises: 'not_found' | 'forbidden'
-- Returns json: { is_changed, family_id, new_calendar_id, new_title, new_start_at }
-- ============================================================
create or replace function update_event_authorized(
  p_actor_user_id   uuid,
  p_event_id        uuid,
  p_title           text,
  p_description     text,
  p_has_description boolean,
  p_start_at        timestamptz,
  p_end_at          timestamptz,
  p_has_end_at      boolean,
  p_is_all_day      boolean,
  p_calendar_id     uuid,
  p_has_calendar_id boolean,
  p_reminder_minutes integer[]
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event            events%rowtype;
  v_has_access       boolean;
  v_resolved_cal_id  uuid;
  v_is_changed       boolean;
begin
  select * into v_event from events where id = p_event_id;
  if not found then
    raise exception 'not_found';
  end if;

  -- Write access on current event
  if v_event.calendar_id is not null then
    select (
      exists(select 1 from calendars      where id          = v_event.calendar_id and family_id  = v_event.family_id)
      and
      exists(select 1 from calendar_members where calendar_id = v_event.calendar_id and user_id = p_actor_user_id)
    ) into v_has_access;
  else
    select exists(
      select 1 from family_members where family_id = v_event.family_id and user_id = p_actor_user_id
    ) into v_has_access;
  end if;

  if not v_has_access then
    raise exception 'forbidden';
  end if;

  v_resolved_cal_id := case when p_has_calendar_id then p_calendar_id else v_event.calendar_id end;

  -- Access check when moving to a different calendar
  if p_has_calendar_id
     and p_calendar_id is not null
     and p_calendar_id is distinct from v_event.calendar_id
  then
    select (
      exists(select 1 from calendars        where id          = p_calendar_id and family_id  = v_event.family_id)
      and
      exists(select 1 from calendar_members where calendar_id = p_calendar_id and user_id = p_actor_user_id)
    ) into v_has_access;

    if not v_has_access then
      raise exception 'forbidden';
    end if;
  end if;

  v_is_changed := (
    (p_title     is not null and p_title     is distinct from v_event.title)     or
    (p_has_description       and case when p_has_description then p_description else v_event.description end is distinct from v_event.description) or
    (p_start_at  is not null and p_start_at  is distinct from v_event.start_at)  or
    (p_has_end_at            and case when p_has_end_at      then p_end_at      else v_event.end_at       end is distinct from v_event.end_at)       or
    (p_is_all_day is not null and p_is_all_day is distinct from v_event.is_all_day) or
    (p_has_calendar_id       and v_resolved_cal_id is distinct from v_event.calendar_id)
  );

  update events set
    title       = coalesce(p_title,     title),
    description = case when p_has_description then p_description else description end,
    start_at    = coalesce(p_start_at,  start_at),
    end_at      = case when p_has_end_at      then p_end_at      else end_at      end,
    is_all_day  = coalesce(p_is_all_day, is_all_day),
    calendar_id = v_resolved_cal_id
  where id = p_event_id;

  if p_reminder_minutes is not null then
    delete from event_reminders where event_id = p_event_id;
    if cardinality(p_reminder_minutes) > 0 then
      insert into event_reminders (event_id, remind_minutes_before)
      select p_event_id, unnest(p_reminder_minutes);
    end if;
  end if;

  return json_build_object(
    'is_changed',      v_is_changed,
    'family_id',       v_event.family_id,
    'new_calendar_id', v_resolved_cal_id,
    'new_title',       coalesce(p_title,    v_event.title),
    'new_start_at',    coalesce(p_start_at, v_event.start_at)
  );
end;
$$;

revoke execute on function update_event_authorized(
  uuid, uuid, text, text, boolean, timestamptz, timestamptz, boolean, boolean, uuid, boolean, integer[]
) from public, anon, authenticated;


-- ============================================================
-- delete_event_authorized
-- Checks write access then deletes, returning metadata needed
-- for push notifications.
-- Raises: 'not_found' | 'forbidden'
-- Returns json: { family_id, calendar_id, title, start_at }
-- ============================================================
create or replace function delete_event_authorized(
  p_actor_user_id uuid,
  p_event_id      uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event      events%rowtype;
  v_has_access boolean;
begin
  select * into v_event from events where id = p_event_id;
  if not found then
    raise exception 'not_found';
  end if;

  if v_event.calendar_id is not null then
    select (
      exists(select 1 from calendars        where id          = v_event.calendar_id and family_id  = v_event.family_id)
      and
      exists(select 1 from calendar_members where calendar_id = v_event.calendar_id and user_id = p_actor_user_id)
    ) into v_has_access;
  else
    select exists(
      select 1 from family_members where family_id = v_event.family_id and user_id = p_actor_user_id
    ) into v_has_access;
  end if;

  if not v_has_access then
    raise exception 'forbidden';
  end if;

  delete from events where id = p_event_id;

  return json_build_object(
    'family_id',  v_event.family_id,
    'calendar_id', v_event.calendar_id,
    'title',      v_event.title,
    'start_at',   v_event.start_at
  );
end;
$$;

revoke execute on function delete_event_authorized(uuid, uuid)
from public, anon, authenticated;
