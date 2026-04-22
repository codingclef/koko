-- Restrict the cron-only reminder RPC to service-role execution.
-- The function marks reminders as sent, so client roles must not be able to
-- call it directly through Supabase RPC.

drop function if exists public.get_and_mark_due_reminders();

create function public.get_and_mark_due_reminders()
returns table (
  reminder_id  uuid,
  event_title  text,
  event_start  timestamptz,
  is_all_day    boolean,
  family_id    uuid
)
security definer
set search_path = public, pg_temp
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

revoke execute on function public.get_and_mark_due_reminders()
from public, anon, authenticated;

grant execute on function public.get_and_mark_due_reminders()
to service_role;
