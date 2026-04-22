-- Include all-day metadata in due reminder payloads so notification text can
-- format all-day events without misleading UTC times.
drop function if exists get_and_mark_due_reminders();

create function get_and_mark_due_reminders()
returns table (
  reminder_id  uuid,
  event_title  text,
  event_start  timestamptz,
  is_all_day    boolean,
  family_id    uuid
)
security definer
language plpgsql as $$
begin
  return query
    update event_reminders er
    set sent_at = now()
    from events e
    where er.event_id = e.id
      and er.sent_at is null
      and (e.start_at - (er.remind_minutes_before * interval '1 minute'))
          between now() - interval '65 seconds' and now() + interval '5 seconds'
    returning er.id, e.title, e.start_at, e.is_all_day, e.family_id;
end;
$$;
