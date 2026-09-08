-- Claim reminders before delivery and acknowledge them only after a usable result.

alter table public.event_reminders
  add column if not exists claimed_at timestamptz;

create index if not exists idx_event_reminders_pending_claim
  on public.event_reminders (claimed_at)
  where sent_at is null;

create or replace function public.claim_due_reminders()
returns table (
  reminder_id uuid,
  event_title text,
  event_start timestamptz,
  is_all_day boolean,
  family_id uuid
)
security definer
set search_path = public, pg_temp
language plpgsql
as $$
begin
  return query
    update event_reminders er
    set claimed_at = now()
    from events e
    where er.event_id = e.id
      and er.sent_at is null
      and (er.claimed_at is null or er.claimed_at < now() - interval '10 minutes')
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
      ) between now() - interval '1 hour' and now() + interval '5 seconds'
    returning er.id, e.title, e.start_at, e.is_all_day, e.family_id;
end;
$$;

create or replace function public.acknowledge_reminders(p_reminder_ids uuid[])
returns integer
security definer
set search_path = public, pg_temp
language plpgsql
as $$
declare
  v_updated_count integer;
begin
  update event_reminders
  set sent_at = now(), claimed_at = null
  where id = any(coalesce(p_reminder_ids, '{}'::uuid[]))
    and sent_at is null;

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke execute on function public.claim_due_reminders()
from public, anon, authenticated;

revoke execute on function public.acknowledge_reminders(uuid[])
from public, anon, authenticated;

grant execute on function public.claim_due_reminders()
to service_role;

grant execute on function public.acknowledge_reminders(uuid[])
to service_role;
