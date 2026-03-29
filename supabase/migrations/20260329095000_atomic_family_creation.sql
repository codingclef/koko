-- Prevent race condition: one user can only belong to one family
alter table family_members 
  add constraint family_members_user_id_unique unique (user_id);

-- Atomic get-or-create family function
create or replace function get_or_create_family(p_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_family_id uuid;
begin
  select family_id into v_family_id
  from family_members where user_id = p_user_id;

  if found then
    return v_family_id;
  end if;

  insert into families (name) values ('Our Family')
  returning id into v_family_id;

  insert into family_members (family_id, user_id, display_name, role)
  values (v_family_id, p_user_id, 'Me', 'admin')
  on conflict (user_id) do nothing;

  -- race condition으로 다른 요청이 먼저 만들었을 경우
  select family_id into v_family_id
  from family_members where user_id = p_user_id;

  return v_family_id;
end;
$$;
