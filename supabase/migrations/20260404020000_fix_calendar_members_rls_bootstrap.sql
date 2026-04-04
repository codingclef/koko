-- ================================================================
-- calendar_members RLS 재설계
--
-- 문제: "calendar owner can manage members" 정책이 FOR ALL + USING만 정의됨.
--       Postgres는 FOR ALL + USING(expr)을 INSERT의 WITH CHECK로도 사용한다.
--       신규 캘린더 생성 시 calendar_members에 아직 레코드가 없으므로
--       owner 자신조차 첫 레코드를 insert할 수 없는 bootstrap 불가 상태 발생.
--
-- 해결: PATTERNS.md 컨벤션 — "자식 테이블 WITH CHECK에서 JOIN 서브쿼리 금지,
--       SECURITY DEFINER 헬퍼 함수 사용"에 따라 재설계
--       1. get_my_owned_calendar_ids() SECURITY DEFINER 추가
--       2. FOR ALL 정책 제거 → INSERT / UPDATE / DELETE 역할별 분리
--       3. INSERT 정책에 bootstrap 케이스(창작자 → owner 등록) 명시
-- ================================================================

-- 기존 FOR ALL 정책 제거
drop policy if exists "calendar owner can manage members" on calendar_members;

-- ── SECURITY DEFINER 헬퍼 함수 ──────────────────────────────
-- 현재 유저가 owner인 캘린더 ID 목록 반환
-- (기존 get_my_calendar_ids()는 접근 가능한 캘린더 전체를 반환하므로 별도 분리)
create or replace function get_my_owned_calendar_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select calendar_id from calendar_members
  where user_id = auth.uid() and role = 'owner'
$$;

-- ── 역할별 분리 정책 ─────────────────────────────────────────

-- INSERT: 두 가지 경우 허용
--   케이스 A (bootstrap): 캘린더 생성자가 자신을 owner로 최초 등록
--   케이스 B (관리):      기존 owner가 다른 멤버를 추가
create policy "calendar_members_insert"
  on calendar_members for insert
  with check (
    (
      -- 케이스 A: created_by = 본인인 캘린더에 자신을 owner로 등록
      user_id = auth.uid()
      and role = 'owner'
      and calendar_id in (select id from calendars where created_by = auth.uid())
    )
    or
    -- 케이스 B: 이미 owner인 캘린더에 멤버 추가
    calendar_id in (select get_my_owned_calendar_ids())
  );

-- UPDATE: owner만 가능
create policy "calendar_members_update"
  on calendar_members for update
  using (calendar_id in (select get_my_owned_calendar_ids()));

-- DELETE: owner만 가능
create policy "calendar_members_delete"
  on calendar_members for delete
  using (calendar_id in (select get_my_owned_calendar_ids()));
