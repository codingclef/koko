-- ================================================================
-- Lock direct shopping list inserts
--
-- 리마인더 목록 생성은 create_shopping_list_authorized RPC로만 허용한다.
-- 클라이언트 직접 insert는 RLS 정책에서 닫아 생성 권한 검증 경로를 단일화한다.
-- ================================================================

drop policy if exists "members can insert reminder lists" on shopping_lists;

create policy "shopping list inserts require authorized rpc"
  on shopping_lists for insert
  with check (false);
