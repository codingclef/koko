-- ================================================================
-- Reminder groups groundwork
--
-- 리마인더에도 캘린더와 같은 별도 그룹/멤버 권한 모델을 추가한다.
-- calendar_groups 와 연동하지 않고 reminder 전용 테이블로 분리한다.
--
-- 기존 리마인더 목록은 reminder_group_id = NULL 로 유지하며 가족 전체
-- 리마인더로 계속 접근 가능하다. 그룹이 지정된 목록은 해당 그룹 멤버만
-- 접근할 수 있다.
-- ================================================================

create table reminder_groups (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  name text not null,
  color text not null default '#3b82f6',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, family_id)
);

create table reminder_group_members (
  reminder_group_id uuid not null references reminder_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (reminder_group_id, user_id)
);

alter table shopping_lists
  add column reminder_group_id uuid null,
  add constraint shopping_lists_reminder_group_family_fkey
    foreign key (reminder_group_id, family_id)
    references reminder_groups (id, family_id)
    on delete restrict;

alter table reminder_groups enable row level security;
alter table reminder_group_members enable row level security;

-- ── SECURITY DEFINER helpers ───────────────────────────────────
-- RLS 정책에서 family_members / reminder_group_members 중첩 조회가 재귀나
-- permission denied 로 이어지지 않도록 helper 함수에 캡슐화한다.

create or replace function get_my_reminder_group_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select reminder_group_id
  from reminder_group_members
  where user_id = auth.uid()
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
$$;

create or replace function is_family_member_of_reminder_group(
  p_reminder_group_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from reminder_groups rg
    join family_members fm on fm.family_id = rg.family_id
    where rg.id = p_reminder_group_id
      and fm.user_id = p_user_id
  )
$$;

create or replace function get_my_list_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select sl.id
  from shopping_lists sl
  where
    (
      sl.reminder_group_id is null
      and sl.family_id in (select get_my_family_ids())
    )
    or sl.reminder_group_id in (select get_my_reminder_group_ids())
$$;

create or replace function prevent_reminder_list_scope_change()
returns trigger
language plpgsql
as $$
begin
  if new.family_id is distinct from old.family_id
     or new.reminder_group_id is distinct from old.reminder_group_id then
    raise exception 'reminder_list_scope_change_not_allowed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger shopping_lists_prevent_scope_change
before update of family_id, reminder_group_id on shopping_lists
for each row
execute function prevent_reminder_list_scope_change();

-- ── reminder_groups RLS ────────────────────────────────────────

create policy "reminder group members can view groups"
  on reminder_groups for select
  using (
    created_by = auth.uid()
    or id in (select get_my_reminder_group_ids())
  );

create policy "family members can create reminder groups"
  on reminder_groups for insert
  with check (family_id in (select get_my_family_ids()));

create policy "reminder group owners can update groups"
  on reminder_groups for update
  using (id in (select get_my_owned_reminder_group_ids()))
  with check (
    id in (select get_my_owned_reminder_group_ids())
    and family_id in (select get_my_family_ids())
  );

create policy "reminder group owners can delete groups"
  on reminder_groups for delete
  using (id in (select get_my_owned_reminder_group_ids()));

-- ── reminder_group_members RLS ─────────────────────────────────

create policy "reminder group members can view members"
  on reminder_group_members for select
  using (reminder_group_id in (select get_my_reminder_group_ids()));

create policy "reminder_group_members_insert"
  on reminder_group_members for insert
  with check (
    is_family_member_of_reminder_group(reminder_group_id, user_id)
    and (
      (
        user_id = auth.uid()
        and role = 'owner'
        and reminder_group_id in (
          select id from reminder_groups where created_by = auth.uid()
        )
      )
      or reminder_group_id in (select get_my_owned_reminder_group_ids())
    )
  );

create policy "reminder_group_members_update"
  on reminder_group_members for update
  using (reminder_group_id in (select get_my_owned_reminder_group_ids()))
  with check (
    reminder_group_id in (select get_my_owned_reminder_group_ids())
    and is_family_member_of_reminder_group(reminder_group_id, user_id)
  );

create policy "reminder_group_members_delete"
  on reminder_group_members for delete
  using (reminder_group_id in (select get_my_owned_reminder_group_ids()));

-- ── shopping RLS 변경 ─────────────────────────────────────────
-- reminder_group_id = NULL: 가족 전체 리마인더
-- reminder_group_id != NULL: 해당 리마인더 그룹 멤버만 접근
-- 접근 범위 변경은 trigger에서 막고, 후속 PR의 명시적 RPC에서만 열어야 한다.

drop policy if exists "family members can manage shopping lists" on shopping_lists;
drop policy if exists "family members can manage shopping items" on shopping_items;

create policy "members can view reminder lists"
  on shopping_lists for select
  using (id in (select get_my_list_ids()));

create policy "members can insert reminder lists"
  on shopping_lists for insert
  with check (
    (
      reminder_group_id is null
      and family_id in (select get_my_family_ids())
    )
    or reminder_group_id in (select get_my_reminder_group_ids())
  );

create policy "members can update reminder lists"
  on shopping_lists for update
  using (id in (select get_my_list_ids()))
  with check (
    (
      reminder_group_id is null
      and family_id in (select get_my_family_ids())
    )
    or reminder_group_id in (select get_my_reminder_group_ids())
  );

create policy "members can delete reminder lists"
  on shopping_lists for delete
  using (id in (select get_my_list_ids()));

create policy "members can manage reminder items"
  on shopping_items for all
  using (list_id in (select get_my_list_ids()))
  with check (list_id in (select get_my_list_ids()));
