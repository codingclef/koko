-- shopping_items RLS의 중첩 서브쿼리 문제 해결
-- shopping_lists 조인 시 RLS가 중첩되어 INSERT가 차단됨
-- → security definer 함수로 분리

create or replace function get_my_list_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select sl.id
  from shopping_lists sl
  where sl.family_id in (select get_my_family_ids())
$$;

-- 기존 정책 교체
drop policy if exists "family members can manage shopping items" on shopping_items;

create policy "family members can manage shopping items"
  on shopping_items for all
  using (list_id in (select get_my_list_ids()))
  with check (list_id in (select get_my_list_ids()));
