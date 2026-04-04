-- ============================================================
-- Push Subscriptions
-- Replace push_tokens with push_subscriptions
-- ============================================================

-- Enable pg_net for HTTP requests from DB (used by pg_cron)
create extension if not exists pg_net with schema extensions;

-- Drop old table (no data, schema only)
drop table if exists push_tokens;

create table push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user_id_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

create policy "users can manage their own push subscriptions"
  on push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger push_subscriptions_updated_at
  before update on push_subscriptions
  for each row execute function update_updated_at();

-- ============================================================
-- Atomically fetch due reminders and mark as sent
-- Prevents duplicate sends when cron overlaps
-- ============================================================
create or replace function get_and_mark_due_reminders()
returns table (
  reminder_id  uuid,
  event_title  text,
  event_start  timestamptz,
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
    returning er.id, e.title, e.start_at, e.family_id;
end;
$$;

-- ============================================================
-- pg_cron setup (run after deploying to Vercel)
-- Replace <VERCEL_URL> and <CRON_SECRET> with actual values,
-- then execute in Supabase SQL editor:
--
-- select cron.schedule(
--   'send-push-reminders',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<VERCEL_URL>/api/cron/send-reminders',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <CRON_SECRET>',
--       'Content-Type',  'application/json'
--     ),
--     body    := '{}'::jsonb
--   )
--   $$
-- );
-- ============================================================
