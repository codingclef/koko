create or replace function join_family_by_invite_code(
  p_user_id uuid,
  p_invite_code text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
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
        role = excluded.role,
        updated_at = now();

  return v_family_id;
end;
$$;
