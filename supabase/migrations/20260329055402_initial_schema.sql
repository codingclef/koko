-- ============================================================
-- Koko Family Hub - Initial Schema
-- ============================================================

-- ============================================================
-- families
-- ============================================================
create table families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- family_members
-- ============================================================
create table family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

-- ============================================================
-- events (calendar)
-- ============================================================
create table events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  is_all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- event_reminders (configurable notifications per event)
-- ============================================================
create table event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  remind_minutes_before integer not null check (remind_minutes_before > 0),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- event_votes
-- ============================================================
create table event_votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('yes', 'no', 'maybe')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);

-- ============================================================
-- shopping_lists
-- ============================================================
create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- shopping_items
-- ============================================================
create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references shopping_lists (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_checked boolean not null default false,
  checked_by uuid references auth.users (id) on delete set null,
  checked_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- memos
-- ============================================================
create table memos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  title text,
  content text not null default '',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- push_tokens
-- ============================================================
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('web', 'ios', 'android')),
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

-- ============================================================
-- updated_at auto-update trigger
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger events_updated_at
  before update on events
  for each row execute function update_updated_at();

create trigger event_votes_updated_at
  before update on event_votes
  for each row execute function update_updated_at();

create trigger memos_updated_at
  before update on memos
  for each row execute function update_updated_at();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table families enable row level security;
alter table family_members enable row level security;
alter table events enable row level security;
alter table event_reminders enable row level security;
alter table event_votes enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_items enable row level security;
alter table memos enable row level security;
alter table push_tokens enable row level security;

-- families: 내가 속한 가족만 조회 가능
create policy "family members can view their family"
  on families for select
  using (
    id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

-- family_members: 같은 가족 구성원만 조회 가능
create policy "family members can view members of their family"
  on family_members for select
  using (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

create policy "family members can insert themselves"
  on family_members for insert
  with check (user_id = auth.uid());

-- events: 같은 가족만 CRUD
create policy "family members can view events"
  on events for select
  using (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

create policy "family members can insert events"
  on events for insert
  with check (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

create policy "family members can update events"
  on events for update
  using (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

create policy "family members can delete events"
  on events for delete
  using (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

-- event_reminders: 이벤트에 접근 가능한 가족만
create policy "family members can manage event reminders"
  on event_reminders for all
  using (
    event_id in (
      select e.id from events e
      join family_members fm on fm.family_id = e.family_id
      where fm.user_id = auth.uid()
    )
  );

-- event_votes: 같은 가족만 조회, 본인 투표만 수정
create policy "family members can view votes"
  on event_votes for select
  using (
    event_id in (
      select e.id from events e
      join family_members fm on fm.family_id = e.family_id
      where fm.user_id = auth.uid()
    )
  );

create policy "users can manage their own votes"
  on event_votes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- shopping_lists: 같은 가족만 CRUD
create policy "family members can manage shopping lists"
  on shopping_lists for all
  using (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

-- shopping_items: 같은 가족만 CRUD
create policy "family members can manage shopping items"
  on shopping_items for all
  using (
    list_id in (
      select sl.id from shopping_lists sl
      join family_members fm on fm.family_id = sl.family_id
      where fm.user_id = auth.uid()
    )
  );

-- memos: 같은 가족만 CRUD
create policy "family members can manage memos"
  on memos for all
  using (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

-- push_tokens: 본인 토큰만 관리
create policy "users can manage their own push tokens"
  on push_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
