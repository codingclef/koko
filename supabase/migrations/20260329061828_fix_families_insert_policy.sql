-- Allow any authenticated user to create a family
create policy "authenticated users can create a family"
  on families for insert
  with check (auth.uid() is not null);
