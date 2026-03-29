-- Replace families INSERT policy with explicit authenticated role targeting
drop policy if exists "authenticated users can create a family" on families;

create policy "authenticated users can create a family"
  on families for insert
  to authenticated
  with check (true);

-- Also grant explicit table permissions to authenticated role
grant insert on families to authenticated;
grant insert on family_members to authenticated;
grant select on families to authenticated;
grant select on family_members to authenticated;
