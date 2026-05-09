-- ================================================================
-- Fix reminder group owner access
--
-- 그룹 생성자가 멤버 row 없이 created_by 조건으로만 그룹을 볼 수 있으면
-- 해당 그룹으로 리마인더 목록을 만들 때 shopping_lists RLS를 통과하지 못한다.
-- 기존 데이터의 owner 멤버십을 보강하고 helper에서도 생성자 그룹을 포함한다.
-- ================================================================

insert into reminder_group_members (reminder_group_id, user_id, role)
select rg.id, rg.created_by, 'owner'
from reminder_groups rg
where rg.created_by is not null
on conflict (reminder_group_id, user_id) do update
set role = case
  when reminder_group_members.role = 'owner' then reminder_group_members.role
  else 'owner'
end;

create or replace function get_my_reminder_group_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select reminder_group_id
  from reminder_group_members
  where user_id = auth.uid()

  union

  select id
  from reminder_groups
  where created_by = auth.uid()
$$;

create or replace function get_my_owned_reminder_group_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select reminder_group_id
  from reminder_group_members
  where user_id = auth.uid()
    and role = 'owner'

  union

  select id
  from reminder_groups
  where created_by = auth.uid()
$$;
