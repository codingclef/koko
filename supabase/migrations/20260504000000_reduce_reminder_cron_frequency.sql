-- Reduce reminder polling overhead by running the reminder cron every 5 minutes
-- with a 6-minute lookback window for scheduler jitter.

drop function if exists public.get_and_mark_due_reminders();

create function public.get_and_mark_due_reminders()
returns table (
  reminder_id  uuid,
  event_title  text,
  event_start  timestamptz,
  is_all_day   boolean,
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
      and (
        case
          when e.is_all_day
            and er.remind_minutes_before >= 1440
            and mod(er.remind_minutes_before, 1440) = 0 then
            (
              (
                timezone('Asia/Tokyo', e.start_at)::date
                - (er.remind_minutes_before / 1440)
              )::timestamp
              + time '08:00'
            ) at time zone 'Asia/Tokyo'
          else
            e.start_at - (er.remind_minutes_before * interval '1 minute')
        end
      ) between now() - interval '6 minutes' and now() + interval '5 seconds'
    returning er.id, e.title, e.start_at, e.is_all_day, e.family_id;
end;
$$;

revoke execute on function public.get_and_mark_due_reminders()
from public, anon, authenticated;

grant execute on function public.get_and_mark_due_reminders()
to service_role;

do $$
declare
  reminder_job_id bigint;
begin
  select jobid
  into reminder_job_id
  from cron.job
  where jobname = 'send-push-reminders'
  limit 1;

  if reminder_job_id is not null then
    perform cron.alter_job(reminder_job_id, schedule := '*/5 * * * *');
  end if;
end;
$$;
