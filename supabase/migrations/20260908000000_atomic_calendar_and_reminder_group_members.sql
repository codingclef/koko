-- Keep calendar/reminder-group metadata and member replacement in one transaction.

create or replace function public.create_calendar_with_members_authorized(
  p_actor_user_id uuid,
  p_family_id uuid,
  p_name text,
  p_color text,
  p_member_user_ids uuid[] default '{}'
)
returns calendars
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_calendar calendars;
begin
  if v_actor_id is null or v_actor_id <> p_actor_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if not exists (
    select 1 from family_members
    where family_id = p_family_id and user_id = v_actor_id
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested(user_id)
    where requested.user_id <> v_actor_id
      and not exists (
        select 1 from family_members
        where family_id = p_family_id and user_id = requested.user_id
      )
  ) then
    raise exception 'invalid_member' using errcode = '22023';
  end if;

  insert into calendars (family_id, created_by, name, color)
  values (p_family_id, v_actor_id, btrim(p_name), p_color)
  returning * into v_calendar;

  insert into calendar_members (calendar_id, user_id, role)
  values (v_calendar.id, v_actor_id, 'owner');

  insert into calendar_members (calendar_id, user_id, role)
  select v_calendar.id, requested.user_id, 'member'
  from (
    select distinct user_id
    from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested(user_id)
  ) requested
  where requested.user_id <> v_actor_id;

  return v_calendar;
end;
$$;

create or replace function public.update_calendar_with_members_authorized(
  p_actor_user_id uuid,
  p_calendar_id uuid,
  p_name text,
  p_color text,
  p_member_user_ids uuid[] default null
)
returns calendars
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_calendar calendars;
begin
  if v_actor_id is null or v_actor_id <> p_actor_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_calendar
  from calendars
  where id = p_calendar_id
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from calendar_members
    where calendar_id = p_calendar_id
      and user_id = v_actor_id
      and role = 'owner'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if p_member_user_ids is not null and exists (
    select 1
    from unnest(p_member_user_ids) requested(user_id)
    where requested.user_id <> v_actor_id
      and not exists (
        select 1 from family_members
        where family_id = v_calendar.family_id and user_id = requested.user_id
      )
  ) then
    raise exception 'invalid_member' using errcode = '22023';
  end if;

  update calendars
  set name = btrim(p_name), color = p_color, updated_at = now()
  where id = p_calendar_id
  returning * into v_calendar;

  if p_member_user_ids is not null then
    delete from calendar_members
    where calendar_id = p_calendar_id and role <> 'owner';

    insert into calendar_members (calendar_id, user_id, role)
    select p_calendar_id, requested.user_id, 'member'
    from (
      select distinct user_id from unnest(p_member_user_ids) requested(user_id)
    ) requested
    where requested.user_id <> v_actor_id
    on conflict (calendar_id, user_id) do nothing;
  end if;

  return v_calendar;
end;
$$;

create or replace function public.create_reminder_group_with_members_authorized(
  p_actor_user_id uuid,
  p_family_id uuid,
  p_name text,
  p_color text,
  p_member_user_ids uuid[] default '{}'
)
returns reminder_groups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_group reminder_groups;
begin
  if v_actor_id is null or v_actor_id <> p_actor_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if not exists (
    select 1 from family_members
    where family_id = p_family_id and user_id = v_actor_id
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested(user_id)
    where requested.user_id <> v_actor_id
      and not exists (
        select 1 from family_members
        where family_id = p_family_id and user_id = requested.user_id
      )
  ) then
    raise exception 'invalid_member' using errcode = '22023';
  end if;

  insert into reminder_groups (family_id, created_by, name, color)
  values (p_family_id, v_actor_id, btrim(p_name), p_color)
  returning * into v_group;

  insert into reminder_group_members (reminder_group_id, user_id, role)
  values (v_group.id, v_actor_id, 'owner');

  insert into reminder_group_members (reminder_group_id, user_id, role)
  select v_group.id, requested.user_id, 'member'
  from (
    select distinct user_id
    from unnest(coalesce(p_member_user_ids, '{}'::uuid[])) requested(user_id)
  ) requested
  where requested.user_id <> v_actor_id;

  return v_group;
end;
$$;

create or replace function public.update_reminder_group_with_members_authorized(
  p_actor_user_id uuid,
  p_reminder_group_id uuid,
  p_name text,
  p_color text,
  p_member_user_ids uuid[] default null
)
returns reminder_groups
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_group reminder_groups;
begin
  if v_actor_id is null or v_actor_id <> p_actor_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_group
  from reminder_groups
  where id = p_reminder_group_id
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not (
    v_group.created_by = v_actor_id
    or exists (
      select 1 from reminder_group_members
      where reminder_group_id = p_reminder_group_id
        and user_id = v_actor_id
        and role = 'owner'
    )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if p_member_user_ids is not null and exists (
    select 1
    from unnest(p_member_user_ids) requested(user_id)
    where requested.user_id <> v_actor_id
      and not exists (
        select 1 from family_members
        where family_id = v_group.family_id and user_id = requested.user_id
      )
  ) then
    raise exception 'invalid_member' using errcode = '22023';
  end if;

  update reminder_groups
  set name = btrim(p_name), color = p_color, updated_at = now()
  where id = p_reminder_group_id
  returning * into v_group;

  if p_member_user_ids is not null then
    delete from reminder_group_members
    where reminder_group_id = p_reminder_group_id and role <> 'owner';

    insert into reminder_group_members (reminder_group_id, user_id, role)
    select p_reminder_group_id, requested.user_id, 'member'
    from (
      select distinct user_id from unnest(p_member_user_ids) requested(user_id)
    ) requested
    where requested.user_id <> v_actor_id
    on conflict (reminder_group_id, user_id) do nothing;
  end if;

  return v_group;
end;
$$;

revoke execute on function public.create_calendar_with_members_authorized(uuid, uuid, text, text, uuid[]) from public, anon;
revoke execute on function public.update_calendar_with_members_authorized(uuid, uuid, text, text, uuid[]) from public, anon;
revoke execute on function public.create_reminder_group_with_members_authorized(uuid, uuid, text, text, uuid[]) from public, anon;
revoke execute on function public.update_reminder_group_with_members_authorized(uuid, uuid, text, text, uuid[]) from public, anon;

grant execute on function public.create_calendar_with_members_authorized(uuid, uuid, text, text, uuid[]) to authenticated;
grant execute on function public.update_calendar_with_members_authorized(uuid, uuid, text, text, uuid[]) to authenticated;
grant execute on function public.create_reminder_group_with_members_authorized(uuid, uuid, text, text, uuid[]) to authenticated;
grant execute on function public.update_reminder_group_with_members_authorized(uuid, uuid, text, text, uuid[]) to authenticated;
