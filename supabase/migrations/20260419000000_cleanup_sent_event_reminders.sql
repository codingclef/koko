-- ============================================================
-- Cleanup sent event reminders after a retention window
-- Only deletes reminders that were already sent and whose event
-- start time is safely in the past.
-- ============================================================

create or replace function cleanup_sent_event_reminders(
  p_retention_days integer default 30
)
returns integer
security definer
language plpgsql
set search_path = public
as $$
declare
  v_deleted_count integer;
begin
  if p_retention_days < 0 then
    raise exception 'invalid_retention_days';
  end if;

  with deleted_rows as (
    delete from event_reminders er
    using events e
    where er.event_id = e.id
      and er.sent_at is not null
      and e.start_at < now() - make_interval(days => p_retention_days)
    returning 1
  )
  select count(*)::integer into v_deleted_count
  from deleted_rows;

  return v_deleted_count;
end;
$$;

revoke execute on function cleanup_sent_event_reminders(integer)
from public, anon, authenticated;

-- ============================================================
-- pg_cron setup (run after deploying to Vercel)
-- Replace <VERCEL_URL> and <CRON_SECRET> with actual values,
-- then execute in Supabase SQL editor:
--
-- select cron.schedule(
--   'cleanup-sent-event-reminders',
--   '17 3 * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<VERCEL_URL>/api/cron/cleanup-reminders',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <CRON_SECRET>',
--       'Content-Type',  'application/json'
--     ),
--     body    := jsonb_build_object('retentionDays', 30)
--   )
--   $$
-- );
-- ============================================================
