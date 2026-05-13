-- ================================================================
-- Authorized shopping item creation
--
-- 인라인 추가는 "anchor 아래 삽입 + 뒤쪽 sort_order 이동 + 새 row 생성"이
-- 한 트랜잭션이어야 하므로 명시 RPC에서 처리한다.
-- ================================================================

create or replace function add_shopping_item_authorized(
  p_actor_user_id uuid,
  p_list_id uuid,
  p_name text,
  p_after_item_id uuid default null
)
returns shopping_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_list shopping_lists;
  v_after_item shopping_items;
  v_insert_sort_order integer;
  v_item shopping_items;
begin
  if v_actor_id is null or v_actor_id <> p_actor_user_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'invalid_name' using errcode = '22023';
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

  if v_list.reminder_group_id is not null and not exists (
    select 1
    from reminder_groups rg
    where rg.id = v_list.reminder_group_id
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

  if p_after_item_id is null then
    select coalesce(max(sort_order) + 1, 0)
    into v_insert_sort_order
    from shopping_items
    where list_id = p_list_id;
  else
    select *
    into v_after_item
    from shopping_items
    where id = p_after_item_id
      and list_id = p_list_id;

    if not found then
      raise exception 'invalid_anchor' using errcode = '22023';
    end if;

    v_insert_sort_order := v_after_item.sort_order + 1;

    update shopping_items
    set sort_order = sort_order + 1
    where list_id = p_list_id
      and sort_order >= v_insert_sort_order;
  end if;

  insert into shopping_items (
    list_id,
    created_by,
    name,
    sort_order
  )
  values (
    p_list_id,
    v_actor_id,
    btrim(p_name),
    v_insert_sort_order
  )
  returning * into v_item;

  return v_item;
end;
$$;

revoke execute on function add_shopping_item_authorized(
  uuid, uuid, text, uuid
) from public, anon;

grant execute on function add_shopping_item_authorized(
  uuid, uuid, text, uuid
) to authenticated;
