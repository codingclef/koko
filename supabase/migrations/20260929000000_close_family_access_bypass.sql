-- Remove a permissive policy found in the linked project. RLS policies are ORed.
drop policy if exists "authenticated users can manage shopping items" on public.shopping_items;

-- Membership is created or changed only by the family API's service-role RPCs.
drop policy if exists "family members can insert themselves" on public.family_members;
drop policy if exists "authenticated users can create a family" on public.families;

revoke insert, update, delete on public.families from public, anon, authenticated;
revoke insert, update, delete on public.family_members from public, anon, authenticated;
grant update (display_name) on public.family_members to authenticated;

-- Item and list creation already goes through authorized RPCs.
revoke insert on public.shopping_items from public, anon, authenticated;
revoke insert on public.shopping_lists from public, anon, authenticated;

-- These functions trust a user ID supplied by the server and bypass RLS.
revoke execute on function public.consume_app_invite(text, text) from public, anon, authenticated;
revoke execute on function public.create_family_with_name(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_my_family(uuid) from public, anon, authenticated;
revoke execute on function public.get_or_create_family(uuid) from public, anon, authenticated;
revoke execute on function public.join_family_by_invite_code(uuid, text, text) from public, anon, authenticated;

grant execute on function public.consume_app_invite(text, text) to service_role;
grant execute on function public.create_family_with_name(uuid, text) to service_role;
grant execute on function public.get_my_family(uuid) to service_role;
grant execute on function public.get_or_create_family(uuid) to service_role;
grant execute on function public.join_family_by_invite_code(uuid, text, text) to service_role;

-- This legacy lookup exists in the migration history but not in every project.
do $$
begin
  if to_regprocedure('public.get_family_id_by_invite_code(text)') is not null then
    execute 'revoke execute on function public.get_family_id_by_invite_code(text) from public, anon, authenticated';
  end if;
end
$$;

-- Existing family joins currently reference a column that does not exist.
create or replace function public.join_family_by_invite_code(
  p_user_id uuid,
  p_invite_code text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family_id uuid;
  v_existing_family_id uuid;
  v_display_name text;
begin
  select id into v_family_id
  from families
  where upper(invite_code) = upper(p_invite_code);

  if not found then
    return null;
  end if;

  select family_id into v_existing_family_id
  from family_members
  where user_id = p_user_id;

  if v_existing_family_id = v_family_id then
    return v_family_id;
  end if;

  v_display_name := nullif(trim(coalesce(p_display_name, '')), '');

  insert into family_members (family_id, user_id, display_name, role)
  values (v_family_id, p_user_id, coalesce(v_display_name, 'Member'), 'member')
  on conflict (user_id) do update
    set family_id = excluded.family_id,
        display_name = excluded.display_name,
        role = excluded.role;

  return v_family_id;
end;
$$;
