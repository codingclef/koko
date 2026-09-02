-- Per-user defaults scoped to a calendar. Existing account-level preferences
-- remain the fallback until a user saves a choice for that calendar.

create table public.user_calendar_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  last_label_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, calendar_id),
  constraint user_calendar_preferences_label_color_check check (
    last_label_color is null or
    last_label_color = any (array[
      '#f97316','#3b82f6','#22c55e','#a855f7',
      '#ec4899','#14b8a6','#ef4444','#eab308',
      '#10b981','#06b6d4','#f59e0b','#6b7280'
    ])
  )
);

alter table public.user_calendar_preferences enable row level security;

create policy "Users can manage their own calendar preferences"
  on public.user_calendar_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_calendar_preferences to authenticated;
grant select, insert, update, delete on public.user_calendar_preferences to service_role;
