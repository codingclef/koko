-- ============================================================
-- Atomic event + reminder save RPCs
-- Replaces sequential INSERT/UPDATE + reminder INSERT/DELETE
-- with single-transaction functions.
-- ============================================================

-- ============================================================
-- create_event_with_reminders
-- ============================================================
create or replace function create_event_with_reminders(
  p_family_id        uuid,
  p_created_by       uuid,
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
as $$
declare
  v_event events;
begin
  insert into events (
    family_id, created_by, calendar_id,
    title, description,
    start_at, end_at, is_all_day
  )
  values (
    p_family_id, p_created_by, p_calendar_id,
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

-- ============================================================
-- update_event_with_reminders
-- p_reminder_minutes = NULL  → reminders unchanged
-- p_reminder_minutes = '{}'  → all reminders deleted
-- p_reminder_minutes = '{n}' → reminders replaced
-- ============================================================
create or replace function update_event_with_reminders(
  p_event_id         uuid,
  p_title            text,
  p_description      text,
  p_start_at         timestamptz,
  p_end_at           timestamptz,
  p_is_all_day       boolean,
  p_calendar_id      uuid,
  p_reminder_minutes integer[]
)
returns void
language plpgsql
security definer
as $$
begin
  update events
  set
    title       = p_title,
    description = p_description,
    start_at    = p_start_at,
    end_at      = p_end_at,
    is_all_day  = p_is_all_day,
    calendar_id = p_calendar_id
  where id = p_event_id;

  if p_reminder_minutes is not null then
    delete from event_reminders where event_id = p_event_id;

    if cardinality(p_reminder_minutes) > 0 then
      insert into event_reminders (event_id, remind_minutes_before)
      select p_event_id, unnest(p_reminder_minutes);
    end if;
  end if;
end;
$$;
