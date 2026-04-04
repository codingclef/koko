-- ================================================================
-- calendars SELECT 정책 보완
--
-- 문제: createCalendar에서 INSERT 후 .select().single()로 새 행을 조회할 때
--       SELECT 정책이 `id in (get_my_calendar_ids())`만 허용함.
--       하지만 이 시점에 calendar_members에 아직 레코드가 없으므로
--       방금 만든 캘린더가 SELECT에서 보이지 않아 PGRST116 에러 발생.
--
-- 해결: 생성자(created_by = auth.uid())는 항상 자신의 캘린더를 볼 수 있도록 정책 확장.
--       이는 의미적으로도 올바름 — 캘린더를 만든 사람은 항상 볼 수 있어야 함.
-- ================================================================

drop policy if exists "calendar members can view calendars" on calendars;

create policy "calendar members can view calendars"
  on calendars for select
  using (
    -- 생성자는 멤버 등록 여부와 무관하게 항상 자신의 캘린더를 볼 수 있음
    created_by = auth.uid()
    or
    -- 멤버로 등록된 캘린더도 조회 가능
    id in (select get_my_calendar_ids())
  );
