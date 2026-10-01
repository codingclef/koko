-- Synthetic rows only. Exercise actual nested RLS, then roll back everything.
begin;
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_peer uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_family uuid;
  v_other_family uuid;
  v_calendar public.calendars;
  v_private_rule uuid;
  v_private_series uuid;
  v_family_rule uuid;
  v_family_series uuid;
  v_actor uuid;
  v_expected integer;
  v_count integer;
  v_code text;
  v_state text;
  v_table text;
begin
  insert into auth.users (id, email) values
    (v_owner, v_owner::text || '@example.invalid'),
    (v_peer, v_peer::text || '@example.invalid'),
    (v_outsider, v_outsider::text || '@example.invalid');
  insert into public.allowed_emails (email, app_role) values
    (v_owner::text || '@example.invalid', 'member'),
    (v_peer::text || '@example.invalid', 'member'),
    (v_outsider::text || '@example.invalid', 'member');
  v_family := public.create_family_with_name(v_owner, 'SECURITY-RECURRING-TEST');
  v_other_family := public.create_family_with_name(v_outsider, 'SECURITY-RECURRING-OTHER');
  select invite_code into v_code from public.families where id = v_family;
  perform public.join_family_by_invite_code(v_peer, v_code, null);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  v_calendar := public.create_calendar_with_members_authorized(v_owner, v_family, 'private', '#3b82f6', array[]::uuid[]);
  insert into public.recurrence_rules (freq) values ('weekly') returning id into v_private_rule;
  insert into public.recurrence_series (family_id, calendar_id, title, rule_id, created_by)
    values (v_family, v_calendar.id, 'private-test', v_private_rule, v_owner) returning id into v_private_series;
  insert into public.recurrence_rules (freq) values ('daily') returning id into v_family_rule;
  insert into public.recurrence_series (family_id, calendar_id, title, rule_id, created_by)
    values (v_family, null, 'family-test', v_family_rule, v_owner) returning id into v_family_series;

  foreach v_actor in array array[v_owner, v_peer, v_outsider] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
    set local role authenticated;
    v_expected := case when v_actor = v_owner then 1 else 0 end;
    select count(*) into v_count from public.recurrence_series where id = v_private_series;
    if v_count <> v_expected then raise exception 'private series visibility incorrect'; end if;
    select count(*) into v_count from public.recurrence_rules where id = v_private_rule;
    if v_count <> v_expected then raise exception 'private rule visibility incorrect'; end if;
    v_expected := case when v_actor = v_outsider then 0 else 1 end;
    select count(*) into v_count from public.recurrence_series where id = v_family_series;
    if v_count <> v_expected then raise exception 'family-wide series visibility incorrect'; end if;
    select count(*) into v_count from public.recurrence_rules where id = v_family_rule;
    if v_count <> v_expected then raise exception 'family-wide rule visibility incorrect'; end if;
    reset role;
  end loop;

  -- App-admin status is not calendar membership.
  update public.allowed_emails set app_role = 'admin' where email = v_peer::text || '@example.invalid';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_peer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.recurrence_series where id = v_private_series;
  if v_count <> 0 then raise exception 'app admin bypassed calendar membership'; end if;
  select count(*) into v_count from public.recurrence_rules where id = v_private_rule;
  if v_count <> 0 then raise exception 'app admin bypassed private rule access'; end if;
  reset role;
  update public.allowed_emails set app_role = 'member' where email = v_peer::text || '@example.invalid';

  -- Membership additions grant reads immediately; revocations remove them.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.update_calendar_with_members_authorized(v_owner, v_calendar.id, 'private', '#3b82f6', array[v_peer]);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_peer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.recurrence_series where id = v_private_series;
  if v_count <> 1 then raise exception 'calendar member cannot read series'; end if;
  select count(*) into v_count from public.recurrence_rules where id = v_private_rule;
  if v_count <> 1 then raise exception 'calendar member cannot read rule'; end if;
  reset role;

  foreach v_state in array array['allowlist-removed', 'banned'] loop
    if v_state = 'allowlist-removed' then
      delete from public.allowed_emails where email = v_peer::text || '@example.invalid';
    else
      update auth.users set banned_until = now() + interval '1 hour' where id = v_peer;
    end if;
    set local role authenticated;
    select count(*) into v_count from public.recurrence_series where id in (v_private_series, v_family_series);
    if v_count <> 0 then raise exception 'revoked member can read series'; end if;
    select count(*) into v_count from public.recurrence_rules where id in (v_private_rule, v_family_rule);
    if v_count <> 0 then raise exception 'revoked member can read rules'; end if;
    reset role;
    if v_state = 'allowlist-removed' then
      insert into public.allowed_emails (email, app_role) values (v_peer::text || '@example.invalid', 'member');
    else
      update auth.users set banned_until = null where id = v_peer;
    end if;
  end loop;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.update_calendar_with_members_authorized(v_owner, v_calendar.id, 'private', '#3b82f6', array[]::uuid[]);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_peer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.recurrence_series where id = v_private_series;
  if v_count <> 0 then raise exception 'removed calendar member can read series'; end if;
  select count(*) into v_count from public.recurrence_rules where id = v_private_rule;
  if v_count <> 0 then raise exception 'removed calendar member can read rule'; end if;
  reset role;

  -- Switching families clears old memberships and family-wide reads.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform public.update_calendar_with_members_authorized(v_owner, v_calendar.id, 'private', '#3b82f6', array[v_peer]);
  select invite_code into v_code from public.families where id = v_other_family;
  perform public.join_family_by_invite_code(v_peer, v_code, null);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_peer, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_count from public.recurrence_series where id in (v_private_series, v_family_series);
  if v_count <> 0 then raise exception 'switched family member can read old series'; end if;
  select count(*) into v_count from public.recurrence_rules where id in (v_private_rule, v_family_rule);
  if v_count <> 0 then raise exception 'switched family member can read old rules'; end if;
  reset role;
  select invite_code into v_code from public.families where id = v_family;
  perform public.join_family_by_invite_code(v_peer, v_code, null);

  -- Calendar deletion already turns its events into family-wide events.
  -- Recurring metadata must keep that existing ON DELETE SET NULL behavior.
  delete from public.calendars where id = v_calendar.id;
  set local role authenticated;
  select count(*) into v_count from public.recurrence_series where id = v_private_series;
  if v_count <> 1 then raise exception 'calendar deletion changed family-wide series behavior'; end if;
  select count(*) into v_count from public.recurrence_rules where id = v_private_rule;
  if v_count <> 1 then raise exception 'calendar deletion changed rule visibility'; end if;
  reset role;

  foreach v_table in array array['recurrence_series', 'recurrence_rules'] loop
    if has_table_privilege('anon', format('public.%I', v_table), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
       or has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT,UPDATE,DELETE,TRUNCATE')
       or not has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')
       or not has_table_privilege('service_role', format('public.%I', v_table), 'SELECT')
       or not has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
       or not has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
       or not has_table_privilege('service_role', format('public.%I', v_table), 'DELETE') then
      raise exception 'recurring metadata grants incorrect for %', v_table;
    end if;
  end loop;
end
$$;
rollback;
