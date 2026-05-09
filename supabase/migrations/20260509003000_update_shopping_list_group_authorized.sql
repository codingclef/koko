-- ================================================================
-- Authorized shopping list group updates
--
-- 리마인더 목록의 공개 범위 변경은 직접 update를 막고, 권한 검증 RPC로만
-- 수행한다. RPC 내부에서만 trigger를 통과할 수 있도록 세션 설정을 사용한다.
-- ================================================================

create or replace function prevent_reminder_list_scope_change()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_reminder_list_scope_change', true) = 'on' then
    return new;
  end if;

  if new.family_id is distinct from old.family_id
     or new.reminder_group_id is distinct from old.reminder_group_id then
    raise exception 'reminder_list_scope_change_not_allowed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function update_shopping_list_group_authorized(
  p_actor_user_id uuid,
  p_list_id uuid,
  p_reminder_group_id uuid default null
)
returns shopping_lists
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_list shopping_lists;
  v_updated shopping_lists;
begin
  if v_actor_id is null or v_actor_id <> p_actor_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select *
  into v_list
  from shopping_lists
  where id = p_list_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from family_members fm
    where fm.family_id = v_list.family_id
      and fm.user_id = v_actor_id
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_reminder_group_id is not null and not exists (
    select 1
    from reminder_groups rg
    where rg.id = p_reminder_group_id
      and rg.family_id = v_list.family_id
      and (
        rg.created_by = v_actor_id
        or exists (
          select 1
          from reminder_group_members rgm
          where rgm.reminder_group_id = rg.id
            and rgm.user_id = v_actor_id
        )
      )
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform set_config('app.allow_reminder_list_scope_change', 'on', true);

  update shopping_lists
  set reminder_group_id = p_reminder_group_id
  where id = p_list_id
  returning * into v_updated;

  return v_updated;
end;
$$;

revoke execute on function update_shopping_list_group_authorized(
  uuid, uuid, uuid
) from public, anon;

grant execute on function update_shopping_list_group_authorized(
  uuid, uuid, uuid
) to authenticated;
