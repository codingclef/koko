-- user_preferences: per-user personal settings (holiday countries, etc.)
-- user_id is the PK (one row per user), enabling simple upsert operations.
-- New preference columns can be added here without changing the pattern.

create table if not exists public.user_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  holiday_countries text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "Users can manage their own preferences"
  on public.user_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
