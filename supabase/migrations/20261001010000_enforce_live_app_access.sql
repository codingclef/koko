-- Check live account state without an Auth-server round trip or JWT-expiry delay.
create or replace function public.get_app_access(p_user_id uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object('email', u.email, 'app_role', a.app_role, 'family_id', fm.family_id)
  from auth.users u
  left join public.allowed_emails a on a.email = lower(u.email)
  left join public.family_members fm on fm.user_id = u.id
  where u.id = p_user_id and u.deleted_at is null
    and (u.banned_until is null or u.banned_until <= now())
$$;
revoke all on function public.get_app_access(uuid) from public, anon, authenticated;
grant execute on function public.get_app_access(uuid) to service_role;

create or replace function public.current_app_user_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select auth.uid() where public.get_app_access(auth.uid())->>'app_role' is not null
$$;
revoke all on function public.current_app_user_id() from public, anon;
grant execute on function public.current_app_user_id() to authenticated, service_role;

create or replace function public.require_app_actor()
returns uuid
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_actor_id uuid := public.current_app_user_id();
begin
  if v_actor_id is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return v_actor_id;
end;
$$;
revoke all on function public.require_app_actor() from public, anon;
grant execute on function public.require_app_actor() to authenticated;

-- RESTRICTIVE policies add an AND gate without changing tenant/member policies.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'families', 'family_members', 'calendars', 'calendar_members', 'events',
    'event_reminders', 'event_votes', 'memos', 'shopping_lists', 'shopping_items',
    'reminder_groups', 'reminder_group_members', 'user_preferences',
    'user_calendar_preferences', 'push_subscriptions'
  ] loop
    execute format('create policy active_app_access on public.%I as restrictive for all to authenticated using ((select public.current_app_user_id()) is not null) with check ((select public.current_app_user_id()) is not null)', v_table);
  end loop;
end
$$;

-- Replace only the verified actor declaration; abort on schema drift.
-- SECURITY DEFINER writers bypass RLS and need their own entry guard.
do $$
declare
  v_name text;
  v_definition text;
  v_marker constant text := 'v_actor_id uuid := auth.uid();';
begin
  foreach v_name in array array[
    'create_calendar_with_members_authorized', 'update_calendar_with_members_authorized',
    'create_reminder_group_with_members_authorized', 'update_reminder_group_with_members_authorized',
    'create_shopping_list_authorized', 'update_shopping_list_group_authorized', 'add_shopping_item_authorized'
  ] loop
    select pg_get_functiondef(p.oid) into strict v_definition
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_name;
    if length(v_definition) - length(replace(v_definition, v_marker, '')) <> length(v_marker) then
      raise exception 'Unexpected actor guard in %', v_name;
    end if;
    execute replace(v_definition, v_marker, 'v_actor_id uuid := public.require_app_actor();');
  end loop;

  foreach v_name in array array[
    'get_my_family_ids', 'get_my_calendar_ids', 'get_my_owned_calendar_ids',
    'get_my_reminder_group_ids', 'get_my_owned_reminder_group_ids'
  ] loop
    select pg_get_functiondef(p.oid) into strict v_definition
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = v_name;
    if position('auth.uid()' in v_definition) = 0 then
      raise exception 'Unexpected identity helper in %', v_name;
    end if;
    execute replace(v_definition, 'auth.uid()', 'public.current_app_user_id()');
  end loop;
end
$$;

create or replace function public.is_family_member_of_reminder_group(p_reminder_group_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.current_app_user_id() is not null and exists (
    select 1 from public.reminder_groups rg
    join public.family_members fm on fm.family_id = rg.family_id
    where rg.id = p_reminder_group_id and fm.user_id = p_user_id
  )
$$;

-- Shared by event changes, due reminders, and daily digests. Preserve subscriptions.
create or replace function public.get_active_push_subscription_ids(p_subscription_ids uuid[])
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select s.id from public.push_subscriptions s
  where s.id = any(p_subscription_ids)
    and public.get_app_access(s.user_id)->>'app_role' is not null
$$;
revoke all on function public.get_active_push_subscription_ids(uuid[]) from public, anon, authenticated;
grant execute on function public.get_active_push_subscription_ids(uuid[]) to service_role;
