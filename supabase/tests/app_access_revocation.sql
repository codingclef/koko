-- Synthetic users/rows only. ROLLBACK also restores role/JWT settings.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_email text := v_user::text || '@example.invalid';
  v_family uuid;
  v_subscription uuid;
  v_calendar public.calendars;
  v_group public.reminder_groups;
  v_list public.shopping_lists;
  v_item public.shopping_items;
  v_call text;
  v_rule uuid;
  v_series uuid;
  v_state text;
  v_table text;
  v_count integer;
begin
  insert into auth.users (id, email) values (v_user, v_email);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  if public.get_app_access(v_user) is null or public.current_app_user_id() is not null then
    raise exception 'active unapproved account must be available for invitation onboarding only';
  end if;
  insert into public.allowed_emails (email, app_role) values (v_email, 'member');
  v_family := public.create_family_with_name(v_user, 'SECURITY-REVOCATION-TEST');
  v_calendar := public.create_calendar_with_members_authorized(v_user, v_family, 'test', '#3b82f6', array[]::uuid[]);
  v_group := public.create_reminder_group_with_members_authorized(v_user, v_family, 'test', '#3b82f6', array[]::uuid[]);
  v_list := public.create_shopping_list_authorized(v_user, v_family, 'test', 'strikethrough', v_group.id);
  v_item := public.add_shopping_item_authorized(v_user, v_list.id, 'test', null);
  perform public.update_calendar_with_members_authorized(v_user, v_calendar.id, 'updated', '#3b82f6', array[]::uuid[]);
  perform public.update_reminder_group_with_members_authorized(v_user, v_group.id, 'updated', '#3b82f6', array[]::uuid[]);
  perform public.update_shopping_list_group_authorized(v_user, v_list.id, null);
  insert into public.recurrence_rules (freq) values ('weekly') returning id into v_rule;
  insert into public.recurrence_series (family_id, calendar_id, title, rule_id, created_by)
  values (v_family, v_calendar.id, 'test', v_rule, v_user) returning id into v_series;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_user, 'https://example.invalid/' || v_user, 'test', 'test') returning id into v_subscription;

  if public.require_app_actor() <> v_user
     or public.get_app_access(v_user)->>'family_id' <> v_family::text
     or not exists (select 1 from public.get_active_push_subscription_ids(array[v_subscription])) then
    raise exception 'active approved account lost access';
  end if;
  set local role authenticated;
  select count(*) into v_count from public.families where id = v_family;
  if v_count <> 1 then raise exception 'active family read blocked'; end if;
  select count(*) into v_count from public.recurrence_series where id = v_series;
  if v_count <> 1 then raise exception 'active recurring series read blocked'; end if;
  select count(*) into v_count from public.recurrence_rules where id = v_rule;
  if v_count <> 1 then raise exception 'active recurrence rule read blocked'; end if;
  reset role;

  foreach v_state in array array['allowlist-removed', 'banned', 'soft-deleted'] loop
    if v_state = 'allowlist-removed' then
      delete from public.allowed_emails where email = v_email;
    elsif v_state = 'banned' then
      update auth.users set banned_until = now() + interval '1 hour' where id = v_user;
    else
      update auth.users set deleted_at = now() where id = v_user;
    end if;

    if public.current_app_user_id() is not null
       or exists (select 1 from public.get_my_family_ids())
       or exists (select 1 from public.get_my_calendar_ids())
       or exists (select 1 from public.get_my_owned_calendar_ids())
       or exists (select 1 from public.get_my_reminder_group_ids())
       or exists (select 1 from public.get_my_owned_reminder_group_ids())
       or exists (select 1 from public.get_my_list_ids())
       or public.is_family_member_of_reminder_group(v_group.id, v_user)
       or exists (select 1 from public.get_active_push_subscription_ids(array[v_subscription])) then
      raise exception 'revoked user still has identity, metadata or push access: %', v_state;
    end if;
    if v_state <> 'allowlist-removed' and public.get_app_access(v_user) is not null then
      raise exception 'inactive auth account passed server check: %', v_state;
    end if;
    begin
      perform public.require_app_actor();
      raise exception 'revoked actor accepted: %', v_state;
    exception when insufficient_privilege then null;
    end;
    set local role authenticated;
    for v_call in select unnest(array[
      format('select public.create_calendar_with_members_authorized(%L,%L,%L,%L,array[]::uuid[])', v_user, v_family, 'denied', '#3b82f6'),
      format('select public.update_calendar_with_members_authorized(%L,%L,%L,%L,array[]::uuid[])', v_user, v_calendar.id, 'denied', '#3b82f6'),
      format('select public.create_reminder_group_with_members_authorized(%L,%L,%L,%L,array[]::uuid[])', v_user, v_family, 'denied', '#3b82f6'),
      format('select public.update_reminder_group_with_members_authorized(%L,%L,%L,%L,array[]::uuid[])', v_user, v_group.id, 'denied', '#3b82f6'),
      format('select public.create_shopping_list_authorized(%L,%L,%L,%L,null)', v_user, v_family, 'denied', 'strikethrough'),
      format('select public.update_shopping_list_group_authorized(%L,%L,null)', v_user, v_list.id),
      format('select public.add_shopping_item_authorized(%L,%L,%L,null)', v_user, v_list.id, 'denied')
    ]) loop
      begin
        execute v_call;
        raise exception 'revoked writer accepted: %', v_state;
      exception when insufficient_privilege then null;
      end;
    end loop;
    select count(*) into v_count from public.families where id = v_family;
    if v_count <> 0 then raise exception 'revoked family read allowed: %', v_state; end if;
    select count(*) into v_count from public.push_subscriptions where id = v_subscription;
    if v_count <> 0 then raise exception 'revoked subscription read allowed: %', v_state; end if;
    select count(*) into v_count from public.recurrence_series where id = v_series;
    if v_count <> 0 then raise exception 'revoked recurring series read allowed: %', v_state; end if;
    select count(*) into v_count from public.recurrence_rules where id = v_rule;
    if v_count <> 0 then raise exception 'revoked recurrence rule read allowed: %', v_state; end if;
    update public.shopping_items set name = 'denied' where id = v_item.id;
    get diagnostics v_count = row_count;
    if v_count <> 0 then raise exception 'revoked item update allowed: %', v_state; end if;
    delete from public.shopping_items where id = v_item.id;
    get diagnostics v_count = row_count;
    if v_count <> 0 then raise exception 'revoked item deletion allowed: %', v_state; end if;
    reset role;

    if v_state = 'allowlist-removed' then
      insert into public.allowed_emails (email, app_role) values (v_email, 'member');
    elsif v_state = 'banned' then
      update auth.users set banned_until = null where id = v_user;
    else
      update auth.users set deleted_at = null where id = v_user;
    end if;
    if public.current_app_user_id() <> v_user then raise exception 'restored access blocked'; end if;
  end loop;

  foreach v_table in array array[
    'families', 'family_members', 'calendars', 'calendar_members', 'events',
    'event_reminders', 'event_votes', 'memos', 'shopping_lists', 'shopping_items',
    'reminder_groups', 'reminder_group_members', 'user_preferences',
    'user_calendar_preferences', 'push_subscriptions'
  ] loop
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = v_table
        and policyname = 'active_app_access' and permissive = 'RESTRICTIVE'
        and cmd = 'ALL' and roles = array['authenticated']::name[]
    ) then raise exception 'missing restrictive access gate on %', v_table; end if;
  end loop;
  if has_function_privilege('authenticated', 'public.get_app_access(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_app_access(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.get_active_push_subscription_ids(uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_active_push_subscription_ids(uuid[])', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_app_access(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.get_active_push_subscription_ids(uuid[])', 'EXECUTE') then
    raise exception 'server-only access RPC grants are incorrect';
  end if;
end
$$;
rollback;
