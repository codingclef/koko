-- ============================================================
-- calendar_members: 캘린더별 접근 멤버 관리
-- ============================================================
-- 설계 원칙:
-- - 접근 권한은 calendar_members 테이블 하나로만 결정
-- - 기존 캘린더: 전체 가족 구성원 seeding (하위 호환)
-- - calendar_id = NULL 인 events(패밀리 전체 일정)는 변경 없음
-- ============================================================

create table calendar_members (
  calendar_id uuid not null references calendars (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  primary key (calendar_id, user_id)
);

alter table calendar_members enable row level security;

-- ── SECURITY DEFINER 헬퍼 함수 ──────────────────────────────
-- PATTERNS.md: RLS 정책에서 중첩 서브쿼리 금지 → SECURITY DEFINER 함수 사용

create or replace function get_my_calendar_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select calendar_id from calendar_members where user_id = auth.uid()
$$;

-- ── calendar_members RLS ─────────────────────────────────────

-- 본인이 속한 캘린더의 멤버 목록 조회 가능
create policy "calendar members can view members"
  on calendar_members for select
  using (calendar_id in (select get_my_calendar_ids()));

-- 캘린더 owner만 멤버 추가/삭제 가능
create policy "calendar owner can manage members"
  on calendar_members for all
  using (
    calendar_id in (
      select calendar_id from calendar_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- ── calendars RLS 변경 ───────────────────────────────────────
-- 기존: 패밀리 전체 공유
-- 변경: calendar_members에 있는 경우만 접근 가능

drop policy if exists "family members can manage calendars" on calendars;

create policy "calendar members can view calendars"
  on calendars for select
  using (id in (select get_my_calendar_ids()));

create policy "family members can create calendars"
  on calendars for insert
  with check (family_id in (select get_my_family_ids()));

create policy "calendar owner can update calendars"
  on calendars for update
  using (
    id in (
      select calendar_id from calendar_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

create policy "calendar owner can delete calendars"
  on calendars for delete
  using (
    id in (
      select calendar_id from calendar_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- ── events RLS 변경 ──────────────────────────────────────────
-- calendar_id = NULL: 패밀리 전체 일정 → 기존 정책 유지
-- calendar_id != NULL: 해당 캘린더 멤버만 접근

drop policy if exists "family members can view events" on events;
drop policy if exists "family members can insert events" on events;
drop policy if exists "family members can update events" on events;
drop policy if exists "family members can delete events" on events;

create policy "members can view events"
  on events for select
  using (
    -- 패밀리 전체 일정 (캘린더 미지정)
    (calendar_id is null and family_id in (select get_my_family_ids()))
    or
    -- 캘린더 일정: 해당 캘린더 멤버만
    calendar_id in (select get_my_calendar_ids())
  );

create policy "members can insert events"
  on events for insert
  with check (
    (calendar_id is null and family_id in (select get_my_family_ids()))
    or
    calendar_id in (select get_my_calendar_ids())
  );

create policy "members can update events"
  on events for update
  using (
    (calendar_id is null and family_id in (select get_my_family_ids()))
    or
    calendar_id in (select get_my_calendar_ids())
  );

create policy "members can delete events"
  on events for delete
  using (
    (calendar_id is null and family_id in (select get_my_family_ids()))
    or
    calendar_id in (select get_my_calendar_ids())
  );

-- ── event_reminders RLS 변경 ─────────────────────────────────

drop policy if exists "family members can manage event reminders" on event_reminders;

create policy "members can manage event reminders"
  on event_reminders for all
  using (
    event_id in (
      select e.id from events e
      where
        (e.calendar_id is null and e.family_id in (select get_my_family_ids()))
        or e.calendar_id in (select get_my_calendar_ids())
    )
  );

-- ── 기존 데이터 seeding ──────────────────────────────────────
-- 기존 캘린더: 생성자를 owner로, 나머지 패밀리 구성원을 member로 등록
-- 이후 owner가 멤버를 조정할 수 있음

insert into calendar_members (calendar_id, user_id, role)
select
  c.id as calendar_id,
  fm.user_id,
  case when fm.user_id = c.created_by then 'owner' else 'member' end as role
from calendars c
join family_members fm on fm.family_id = c.family_id
on conflict (calendar_id, user_id) do nothing;
