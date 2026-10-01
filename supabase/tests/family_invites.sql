-- Synthetic rows only; rollback leaves the linked database unchanged.
begin;
do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_family_id uuid;
  v_default_family_id uuid;
  v_code text;
begin
  insert into auth.users (id, email) values (v_user_id, v_user_id::text || '@example.invalid');
  v_family_id := public.create_family_with_name(v_user_id, 'SECURITY-INVITE-TEST');
  select invite_code into v_code from public.families where id = v_family_id;
  if v_code !~ '^[A-F0-9]{24}$' then
    raise exception 'family creation generated a weak invitation';
  end if;
  if public.create_family_with_name(v_user_id, 'SHOULD-NOT-REPLACE') <> v_family_id then
    raise exception 'family creation is no longer idempotent';
  end if;
  if public.join_family_by_invite_code(v_user_id, lower(v_code), null) <> v_family_id then
    raise exception 'long lowercase invitation is not accepted';
  end if;

  insert into public.families (name) values ('SECURITY-INVITE-DEFAULT-TEST')
  returning id, invite_code into v_default_family_id, v_code;
  if v_code !~ '^[A-F0-9]{24}$' then
    raise exception 'default invitation is weak';
  end if;
  update public.families set invite_code = 'OLD123' where id = v_default_family_id;
  if public.join_family_by_invite_code(v_user_id, 'old123', null) <> v_default_family_id then
    raise exception 'legacy family invitation compatibility was lost';
  end if;
end
$$;
rollback;
