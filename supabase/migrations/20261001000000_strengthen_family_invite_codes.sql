-- 12 random bytes give family invitations 96 bits of entropy.
-- Existing codes remain valid until explicitly rotated.
alter table public.families
  alter column invite_code set default upper(encode(extensions.gen_random_bytes(12), 'hex'));

create or replace function public.create_family_with_name(p_user_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_id uuid;
  v_code text;
begin
  select family_id into v_family_id
  from family_members where user_id = p_user_id;

  if v_family_id is not null then
    return v_family_id;
  end if;

  loop
    v_code := upper(encode(extensions.gen_random_bytes(12), 'hex'));
    exit when not exists (select 1 from families where upper(invite_code) = v_code);
  end loop;

  insert into families (name, invite_code)
  values (trim(p_name), v_code)
  returning id into v_family_id;

  insert into family_members (family_id, user_id, display_name, role)
  values (v_family_id, p_user_id, 'Member', 'admin');

  return v_family_id;
end;
$$;

revoke execute on function public.create_family_with_name(uuid, text) from public, anon, authenticated;
grant execute on function public.create_family_with_name(uuid, text) to service_role;
