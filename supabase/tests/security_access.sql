-- Read-only permission checks for the linked project after migrations are applied.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shopping_items'
      and policyname = 'authenticated users can manage shopping items'
  ) then
    raise exception 'shopping_items has a family-wide bypass policy';
  end if;

  if has_column_privilege('authenticated', 'public.family_members', 'family_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.family_members', 'role', 'UPDATE')
     or has_table_privilege('authenticated', 'public.family_members', 'INSERT') then
    raise exception 'family membership can be changed directly';
  end if;

  if not has_column_privilege('authenticated', 'public.family_members', 'display_name', 'UPDATE') then
    raise exception 'display-name edits are no longer available';
  end if;

  if has_table_privilege('authenticated', 'public.families', 'INSERT')
     or has_table_privilege('authenticated', 'public.shopping_items', 'INSERT')
     or has_table_privilege('authenticated', 'public.shopping_lists', 'INSERT') then
    raise exception 'direct creation still bypasses an authorized RPC';
  end if;

  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in (
        'consume_app_invite', 'create_family_with_name', 'get_my_family',
        'get_or_create_family', 'join_family_by_invite_code'
      )
      and (
        has_function_privilege('anon', oid, 'EXECUTE')
        or has_function_privilege('authenticated', oid, 'EXECUTE')
        or not has_function_privilege('service_role', oid, 'EXECUTE')
      )
  ) then
    raise exception 'a server-only family RPC has unsafe execute grants';
  end if;
end
$$;
