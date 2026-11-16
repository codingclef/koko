-- Exercise the production RPCs with synthetic data, then roll back.
BEGIN;

DO $$
DECLARE
  v_actor uuid := gen_random_uuid();
  v_family uuid;
  v_calendar uuid;
  v_event uuid;
  v_conversion uuid;
  v_series uuid;
  v_second uuid;
  v_replacement uuid;
  v_claim uuid;
  v_count integer;
  v_now timestamptz := now();
BEGIN
  IF public.event_reminder_due_at('2028-03-31 00:30+09', false, -1)
      <> '2028-02-29 00:30+09'::timestamptz
    OR public.event_reminder_due_at('2027-03-31 00:00+09', true, -1)
      <> '2027-02-28 08:00+09'::timestamptz
    OR public.event_reminder_due_at('2027-03-31 10:03+09', false, 5)
      <> '2027-03-31 09:58+09'::timestamptz
  THEN
    RAISE EXCEPTION 'alarm calendar arithmetic is incorrect';
  END IF;

  IF NOT public.is_event_reminder_choice(55, false)
    OR public.is_event_reminder_choice(7, false)
    OR public.is_event_reminder_choice(36 * 60, false)
    OR public.is_event_reminder_choice(60, true)
    OR NOT public.is_event_reminder_choice(40320, true)
    OR NOT public.is_event_reminder_choice(-12, true)
    OR public.is_event_reminder_choice(-13, true)
  THEN
    RAISE EXCEPTION 'alarm validation does not match the picker';
  END IF;

  INSERT INTO auth.users (id, email) VALUES (v_actor, v_actor::text || '@example.invalid');
  INSERT INTO public.families (name) VALUES ('alarm-test') RETURNING id INTO v_family;
  INSERT INTO public.family_members (family_id, user_id, display_name) VALUES (v_family, v_actor, 'Alarm test');
  INSERT INTO public.calendars (family_id, created_by, name, color)
    VALUES (v_family, v_actor, 'Alarm test', '#3b82f6') RETURNING id INTO v_calendar;
  INSERT INTO public.calendar_members (calendar_id, user_id) VALUES (v_calendar, v_actor);

  SELECT id INTO v_event FROM public.create_event_authorized(
    v_actor, v_calendar, 'Study', NULL, v_now + interval '10 minutes', NULL, false, ARRAY[10], NULL
  );
  INSERT INTO public.event_reminders (event_id, remind_minutes_before) VALUES (v_event, 10);
  SELECT count(*), min(claim_token::text)::uuid INTO v_count, v_claim
  FROM public.claim_due_reminders() WHERE calendar_id = v_calendar;
  IF v_count <> 2 OR v_claim IS NULL THEN RAISE EXCEPTION 'coincident alarms were not claimed'; END IF;
  IF EXISTS (SELECT 1 FROM public.event_reminders WHERE event_id = v_event AND claim_token IS DISTINCT FROM v_claim)
  THEN RAISE EXCEPTION 'coincident alarms received separate delivery tokens'; END IF;
  IF EXISTS (SELECT 1 FROM public.claim_due_reminders()) THEN RAISE EXCEPTION 'claimed alarm was offered twice'; END IF;

  UPDATE public.events SET start_at = start_at + interval '1 day' WHERE id = v_event;
  IF public.acknowledge_reminders(ARRAY[]::uuid[], ARRAY[v_claim]) <> 0
  THEN RAISE EXCEPTION 'old claim acknowledged a rescheduled alarm'; END IF;

  UPDATE public.events SET start_at = v_now + interval '3 minutes' WHERE id = v_event;
  IF EXISTS (SELECT 1 FROM public.claim_due_reminders())
  THEN RAISE EXCEPTION 'rescheduling generated a catch-up delivery for a past alarm'; END IF;

  UPDATE public.event_reminders SET sent_at = v_now WHERE event_id = v_event;
  INSERT INTO public.event_reminders (event_id, remind_minutes_before) VALUES (v_event, 90), (v_event, -1);
  PERFORM public.update_event_authorized(
    v_actor, v_event, 'Renamed', NULL, false, NULL, NULL, false, NULL, NULL, false, ARRAY[10, 60, 90],
    p_label_color => NULL
  );
  IF (SELECT count(*) FROM public.event_reminders WHERE event_id = v_event AND sent_at = v_now) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.event_reminders WHERE event_id = v_event AND remind_minutes_before = -1)
  THEN RAISE EXCEPTION 'old client reset delivery history or removed a month'; END IF;
  BEGIN
    PERFORM public.update_event_authorized(
      v_actor, v_event, 'Invalid', NULL, false, NULL, NULL, false, NULL, NULL, false,
      ARRAY[7], p_use_reminder_offsets => true
    );
    RAISE EXCEPTION 'invalid offset was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'invalid_reminder_offsets' THEN RAISE; END IF;
  END;
  PERFORM public.update_event_authorized(
    v_actor, v_event, NULL, NULL, false, NULL, NULL, false, NULL, NULL, false,
    ARRAY[10, 90], p_use_reminder_offsets => true
  );
  IF EXISTS (SELECT 1 FROM public.event_reminders WHERE event_id = v_event AND remind_minutes_before < 0)
  THEN RAISE EXCEPTION 'new client could not remove a month'; END IF;

  PERFORM public.update_event_authorized(
    v_actor, v_event, NULL, NULL, false, NULL, NULL, false, true, NULL, false,
    ARRAY[1440], p_use_reminder_offsets => true
  );
  INSERT INTO public.event_reminders (event_id, remind_minutes_before) VALUES (v_event, 30);
  PERFORM public.update_event_authorized(
    v_actor, v_event, NULL, NULL, false, NULL, NULL, false, NULL, NULL, false,
    ARRAY[1440, 2880, 30], p_use_reminder_offsets => true
  );
  IF NOT EXISTS (SELECT 1 FROM public.event_reminders WHERE event_id = v_event AND remind_minutes_before = 30)
  THEN RAISE EXCEPTION 'another alarm edit removed the existing all-day minute alarm'; END IF;

  SELECT series_id INTO v_series FROM public.create_recurring_series_authorized(
    v_actor, NULL, 'Recurring', NULL, '2027-03-31 00:30+09', '2027-03-31 01:30+09', false,
    ARRAY[-1], 'daily', 1, ARRAY[]::integer[], NULL, '2027-04-02', NULL
  );
  SELECT id INTO STRICT v_event FROM public.events WHERE series_id = v_series AND series_occurrence_date = '2027-03-31';
  SELECT id INTO STRICT v_second FROM public.events WHERE series_id = v_series AND series_occurrence_date = '2027-04-01';
  IF (SELECT start_at FROM public.events WHERE id = v_event) <> '2027-03-31 00:30+09'::timestamptz
  THEN RAISE EXCEPTION 'recurring occurrence is on the wrong Tokyo date'; END IF;

  PERFORM public.update_series_authorized(
    v_actor, v_second, 'single', '2027-04-01', NULL, NULL, false, NULL, NULL, false,
    NULL, NULL, NULL, NULL, false, ARRAY[-2, 60], p_use_reminder_offsets => true
  );
  UPDATE public.event_reminders SET sent_at = v_now WHERE event_id = v_second AND remind_minutes_before = -2;
  PERFORM public.update_series_authorized(
    v_actor, v_event, 'all', '2027-03-31', 'Renamed series', NULL, false, NULL, NULL, false,
    NULL, NULL, NULL, NULL, false, NULL, p_use_reminder_offsets => true
  );
  IF (SELECT count(*) FROM public.event_reminders WHERE event_id = v_second AND remind_minutes_before IN (-2, 60)) <> 2
  THEN RAISE EXCEPTION 'series rename overwrote an occurrence alarm'; END IF;

  PERFORM public.split_recurring_series_following_authorized(
    v_actor, v_second, '2027-04-01', '2027-04-01', NULL, NULL, false,
    '2027-04-01 00:30+09', '2027-04-01 01:30+09', true, false, NULL, false, NULL,
    p_use_reminder_offsets => true
  );
  SELECT id INTO STRICT v_replacement FROM public.events
    WHERE series_id <> v_series AND series_occurrence_date = '2027-04-01' AND NOT is_cancelled;
  IF NOT EXISTS (
    SELECT 1 FROM public.event_reminders
    WHERE event_id = v_replacement AND remind_minutes_before = -2 AND sent_at = v_now
  ) THEN RAISE EXCEPTION 'following split lost a matching alarm or its delivery history'; END IF;

  SELECT id INTO v_conversion FROM public.create_event_authorized(
    v_actor, NULL, 'Convert', NULL, '2027-05-10 00:30+09', '2027-05-10 01:30+09', false, ARRAY[-1], NULL
  );
  PERFORM public.convert_event_to_recurring_series_authorized(
    v_actor, v_conversion, NULL, 'Convert', NULL,
    '2027-05-10 00:30+09', '2027-05-10 01:30+09', '2027-05-10', '2027-05-10', false,
    ARRAY[-1], 'daily', 1, ARRAY[]::integer[], NULL, '2027-05-11', NULL, '2027-05-01', true
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.events e JOIN public.event_reminders er ON er.event_id = e.id
    WHERE e.series_id = (SELECT series_id FROM public.events WHERE id = v_conversion)
      AND e.start_at = '2027-05-11 00:30+09'::timestamptz AND er.remind_minutes_before = -1
  ) THEN RAISE EXCEPTION 'conversion lost the month rule on new occurrences'; END IF;
END;
$$;

ROLLBACK;
