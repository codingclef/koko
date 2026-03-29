-- Fix infinite recursion in RLS policies
-- The issue: family_members SELECT policy queries family_members itself → infinite loop
-- Solution: use a security definer function that bypasses RLS

create or replace function get_my_family_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select family_id from family_members where user_id = auth.uid()
$$;

-- Drop all recursive policies and replace with non-recursive versions
drop policy if exists "family members can view members of their family" on family_members;
drop policy if exists "family members can view their family" on families;
drop policy if exists "family members can view events" on events;
drop policy if exists "family members can insert events" on events;
drop policy if exists "family members can update events" on events;
drop policy if exists "family members can delete events" on events;
drop policy if exists "family members can manage event reminders" on event_reminders;
drop policy if exists "family members can view votes" on event_votes;
drop policy if exists "family members can manage shopping lists" on shopping_lists;
drop policy if exists "family members can manage shopping items" on shopping_items;
drop policy if exists "family members can manage memos" on memos;

-- Re-create policies using the helper function (no more recursion)
create policy "family members can view members of their family"
  on family_members for select
  using (family_id in (select get_my_family_ids()));

create policy "family members can view their family"
  on families for select
  using (id in (select get_my_family_ids()));

create policy "family members can view events"
  on events for select
  using (family_id in (select get_my_family_ids()));

create policy "family members can insert events"
  on events for insert
  with check (family_id in (select get_my_family_ids()));

create policy "family members can update events"
  on events for update
  using (family_id in (select get_my_family_ids()));

create policy "family members can delete events"
  on events for delete
  using (family_id in (select get_my_family_ids()));

create policy "family members can manage event reminders"
  on event_reminders for all
  using (
    event_id in (
      select e.id from events e
      where e.family_id in (select get_my_family_ids())
    )
  );

create policy "family members can view votes"
  on event_votes for select
  using (
    event_id in (
      select e.id from events e
      where e.family_id in (select get_my_family_ids())
    )
  );

create policy "family members can manage shopping lists"
  on shopping_lists for all
  using (family_id in (select get_my_family_ids()));

create policy "family members can manage shopping items"
  on shopping_items for all
  using (
    list_id in (
      select sl.id from shopping_lists sl
      where sl.family_id in (select get_my_family_ids())
    )
  );

create policy "family members can manage memos"
  on memos for all
  using (family_id in (select get_my_family_ids()));
