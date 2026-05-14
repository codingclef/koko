-- ================================================================
-- Backfill Data API table grants for public schema
--
-- Supabase no longer auto-exposes new public tables to the Data API.
-- Existing migrations in this repository predate that change, so a fresh
-- project bootstrap needs explicit table-level GRANTs in addition to RLS.
-- ================================================================

do $$
begin
  if to_regclass('public.families') is not null then
    execute 'grant select, insert on public.families to authenticated';
    execute 'grant select, insert, update, delete on public.families to service_role';
  end if;

  if to_regclass('public.family_members') is not null then
    execute 'grant select, insert, update on public.family_members to authenticated';
    execute 'grant select, insert, update, delete on public.family_members to service_role';
  end if;

  if to_regclass('public.calendars') is not null then
    execute 'grant select, insert, update, delete on public.calendars to authenticated';
    execute 'grant select, insert, update, delete on public.calendars to service_role';
  end if;

  if to_regclass('public.calendar_members') is not null then
    execute 'grant select, insert, update, delete on public.calendar_members to authenticated';
    execute 'grant select, insert, update, delete on public.calendar_members to service_role';
  end if;

  if to_regclass('public.events') is not null then
    execute 'grant select on public.events to authenticated';
    execute 'grant select, insert, update, delete on public.events to service_role';
  end if;

  if to_regclass('public.event_reminders') is not null then
    execute 'grant select on public.event_reminders to authenticated';
    execute 'grant select, insert, update, delete on public.event_reminders to service_role';
  end if;

  if to_regclass('public.event_votes') is not null then
    execute 'grant select, insert, update, delete on public.event_votes to authenticated';
    execute 'grant select, insert, update, delete on public.event_votes to service_role';
  end if;

  if to_regclass('public.recurrence_rules') is not null then
    execute 'grant select on public.recurrence_rules to authenticated';
    execute 'grant select, insert, update, delete on public.recurrence_rules to service_role';
  end if;

  if to_regclass('public.recurrence_series') is not null then
    execute 'grant select on public.recurrence_series to authenticated';
    execute 'grant select, insert, update, delete on public.recurrence_series to service_role';
  end if;

  if to_regclass('public.shopping_lists') is not null then
    execute 'grant select, update, delete on public.shopping_lists to authenticated';
    execute 'grant select, insert, update, delete on public.shopping_lists to service_role';
  end if;

  if to_regclass('public.shopping_items') is not null then
    execute 'grant select, update, delete on public.shopping_items to authenticated';
    execute 'grant select, insert, update, delete on public.shopping_items to service_role';
  end if;

  if to_regclass('public.reminder_groups') is not null then
    execute 'grant select, insert, update, delete on public.reminder_groups to authenticated';
    execute 'grant select, insert, update, delete on public.reminder_groups to service_role';
  end if;

  if to_regclass('public.reminder_group_members') is not null then
    execute 'grant select, insert, update, delete on public.reminder_group_members to authenticated';
    execute 'grant select, insert, update, delete on public.reminder_group_members to service_role';
  end if;

  if to_regclass('public.user_preferences') is not null then
    execute 'grant select, insert, update on public.user_preferences to authenticated';
    execute 'grant select, insert, update, delete on public.user_preferences to service_role';
  end if;

  if to_regclass('public.push_subscriptions') is not null then
    execute 'grant select, insert, update, delete on public.push_subscriptions to authenticated';
    execute 'grant select, insert, update, delete on public.push_subscriptions to service_role';
  end if;

  if to_regclass('public.memos') is not null then
    execute 'grant select, insert, update, delete on public.memos to authenticated';
    execute 'grant select, insert, update, delete on public.memos to service_role';
  end if;

  if to_regclass('public.allowed_emails') is not null then
    execute 'grant select, insert, update, delete on public.allowed_emails to service_role';
  end if;

  if to_regclass('public.app_invites') is not null then
    execute 'grant select, insert, update, delete on public.app_invites to service_role';
  end if;

  if to_regclass('public.daily_digest_log') is not null then
    execute 'grant select, insert, update, delete on public.daily_digest_log to service_role';
  end if;
end
$$;
