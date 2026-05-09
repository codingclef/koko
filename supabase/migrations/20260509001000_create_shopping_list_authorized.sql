-- ================================================================
-- Authorized shopping list creation
--
-- 그룹 지정 리마인더 생성은 클라이언트 직접 insert 대신 명시 RPC에서
-- actor/family/group 권한을 확인한 뒤 서버 측에서 생성한다.
-- ================================================================

create or replace function create_shopping_list_authorized(
  p_actor_user_id uuid,
  p_family_id uuid,
  p_name text,
  p_type text,
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
begin
  if v_actor_id is null or v_actor_id <> p_actor_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if p_type not in ('strikethrough', 'delete') then
    raise exception 'invalid_type' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from family_members fm
    where fm.family_id = p_family_id
      and fm.user_id = v_actor_id
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_reminder_group_id is not null and not exists (
    select 1
    from reminder_groups rg
    where rg.id = p_reminder_group_id
      and rg.family_id = p_family_id
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

  insert into shopping_lists (
    family_id,
    created_by,
    name,
    type,
    reminder_group_id
  )
  values (
    p_family_id,
    v_actor_id,
    btrim(p_name),
    p_type,
    p_reminder_group_id
  )
  returning * into v_list;

  return v_list;
end;
$$;

revoke execute on function create_shopping_list_authorized(
  uuid, uuid, text, text, uuid
) from public, anon;

grant execute on function create_shopping_list_authorized(
  uuid, uuid, text, text, uuid
) to authenticated;
