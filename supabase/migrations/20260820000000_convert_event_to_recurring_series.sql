-- Convert an existing same-day event into a recurring series without replacing
-- the original event row. This preserves its id and dependent records while
-- creating the recurrence rule, series, and future occurrences atomically.

CREATE OR REPLACE FUNCTION convert_event_to_recurring_series_authorized(
  p_actor_user_id    uuid,
  p_event_id         uuid,
  p_calendar_id      uuid,
  p_title            text,
  p_description      text,
  p_start_at         timestamptz,
  p_end_at           timestamptz,
  p_local_start_date date,
  p_local_end_date   date,
  p_is_all_day       boolean,
  p_reminder_minutes integer[],
  p_freq             text,
  p_interval         integer,
  p_days_of_week     integer[],
  p_day_of_month     integer,
  p_end_date         date,
  p_label_color      text,
  p_today            date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event          events%rowtype;
  v_has_access     boolean;
  v_rule_id        uuid;
  v_series_id      uuid;
  v_horizon        date;
  v_start_time     time;
  v_end_time       time;
  v_days_of_week   integer[];
  v_day_of_month   integer;
  v_current_date   date;
  v_week_start     date;
  v_occurrence     date;
  v_day            integer;
  v_count          integer := 0;
BEGIN
  IF p_actor_user_id IS NULL OR p_today IS NULL THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  SELECT * INTO v_event
  FROM events
  WHERE id = p_event_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_event.series_id IS NOT NULL THEN RAISE EXCEPTION 'already_recurring'; END IF;

  IF v_event.calendar_id IS NOT NULL THEN
    SELECT (
      EXISTS(
        SELECT 1 FROM calendars
        WHERE id = v_event.calendar_id AND family_id = v_event.family_id
      )
      AND EXISTS(
        SELECT 1 FROM calendar_members
        WHERE calendar_id = v_event.calendar_id AND user_id = p_actor_user_id
      )
    ) INTO v_has_access;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM family_members
      WHERE family_id = v_event.family_id AND user_id = p_actor_user_id
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_calendar_id IS NOT NULL THEN
    SELECT (
      EXISTS(
        SELECT 1 FROM calendars
        WHERE id = p_calendar_id AND family_id = v_event.family_id
      )
      AND EXISTS(
        SELECT 1 FROM calendar_members
        WHERE calendar_id = p_calendar_id AND user_id = p_actor_user_id
      )
    ) INTO v_has_access;

    IF NOT v_has_access THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' OR p_start_at IS NULL OR p_end_at IS NULL
     OR p_local_start_date IS NULL OR p_local_end_date IS NULL
     OR p_is_all_day IS NULL OR p_reminder_minutes IS NULL
  THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  IF p_local_start_date < p_today THEN RAISE EXCEPTION 'past_event'; END IF;
  IF p_local_start_date <> p_local_end_date THEN RAISE EXCEPTION 'multi_day_event'; END IF;
  IF p_end_at < p_start_at THEN RAISE EXCEPTION 'invalid_event_range'; END IF;
  IF (p_start_at AT TIME ZONE 'Asia/Tokyo')::date <> p_local_start_date
     OR (p_end_at AT TIME ZONE 'Asia/Tokyo')::date <> p_local_end_date
  THEN
    RAISE EXCEPTION 'invalid_local_date';
  END IF;

  IF p_freq NOT IN ('daily', 'weekly', 'monthly', 'yearly') THEN
    RAISE EXCEPTION 'invalid_frequency';
  END IF;
  IF p_interval IS NULL OR p_interval < 1 THEN RAISE EXCEPTION 'invalid_interval'; END IF;

  IF p_freq = 'weekly' THEN
    v_days_of_week := CASE
      WHEN cardinality(p_days_of_week) > 0 THEN p_days_of_week
      ELSE ARRAY[EXTRACT(DOW FROM p_local_start_date)::integer]
    END;

    IF EXISTS (
      SELECT 1 FROM unnest(v_days_of_week) AS selected_day
      WHERE selected_day < 0 OR selected_day > 6
    ) OR cardinality(v_days_of_week) <> (
      SELECT count(DISTINCT selected_day)::integer FROM unnest(v_days_of_week) AS selected_day
    ) THEN
      RAISE EXCEPTION 'invalid_days_of_week';
    END IF;

    IF NOT (EXTRACT(DOW FROM p_local_start_date)::integer = ANY(v_days_of_week)) THEN
      RAISE EXCEPTION 'start_day_not_selected';
    END IF;
  ELSE
    v_days_of_week := NULL;
  END IF;

  IF p_freq = 'monthly' THEN
    v_day_of_month := COALESCE(p_day_of_month, EXTRACT(DAY FROM p_local_start_date)::integer);
    IF v_day_of_month < 1 OR v_day_of_month > 31 THEN
      RAISE EXCEPTION 'invalid_day_of_month';
    END IF;
  ELSE
    v_day_of_month := NULL;
  END IF;

  IF p_end_date IS NOT NULL AND (
    p_end_date < p_local_start_date
    OR p_end_date > (p_local_start_date + INTERVAL '2 years')::date
  ) THEN
    RAISE EXCEPTION 'invalid_end_date';
  END IF;

  v_horizon := LEAST(
    COALESCE(p_end_date, (p_local_start_date + INTERVAL '1 year')::date),
    (p_local_start_date + INTERVAL '2 years')::date
  );

  IF NOT p_is_all_day THEN
    v_start_time := p_start_at::time;
    v_end_time := p_end_at::time;
  END IF;

  INSERT INTO recurrence_rules (freq, interval, days_of_week, day_of_month, end_date)
  VALUES (p_freq, p_interval, v_days_of_week, v_day_of_month, p_end_date)
  RETURNING id INTO v_rule_id;

  INSERT INTO recurrence_series (
    family_id, calendar_id, title, description, is_all_day,
    start_time, end_time, reminder_minutes, rule_id, created_by
  ) VALUES (
    v_event.family_id, p_calendar_id, p_title, p_description, p_is_all_day,
    v_start_time, v_end_time, p_reminder_minutes, v_rule_id, v_event.created_by
  )
  RETURNING id INTO v_series_id;

  UPDATE events SET
    calendar_id = p_calendar_id,
    title = p_title,
    description = p_description,
    start_at = p_start_at,
    end_at = p_end_at,
    is_all_day = p_is_all_day,
    label_color = p_label_color,
    series_id = v_series_id,
    series_occurrence_date = p_local_start_date,
    is_cancelled = false,
    updated_at = now()
  WHERE id = p_event_id;

  DELETE FROM event_reminders WHERE event_id = p_event_id;
  IF cardinality(p_reminder_minutes) > 0 THEN
    INSERT INTO event_reminders (event_id, remind_minutes_before)
    SELECT p_event_id, unnest(p_reminder_minutes);
  END IF;

  IF p_freq = 'daily' THEN
    v_current_date := p_local_start_date;
    WHILE v_current_date <= v_horizon LOOP
      PERFORM insert_series_event_instance(
        v_series_id, v_event.family_id, v_event.created_by, p_calendar_id,
        p_title, p_description, p_is_all_day,
        v_start_time, v_end_time, v_current_date, p_reminder_minutes, p_label_color
      );
      v_count := v_count + 1;
      v_current_date := v_current_date + (p_interval || ' days')::interval;
    END LOOP;
  ELSIF p_freq = 'weekly' THEN
    v_week_start := p_local_start_date - EXTRACT(DOW FROM p_local_start_date)::integer;
    WHILE v_week_start <= v_horizon LOOP
      FOREACH v_day IN ARRAY v_days_of_week LOOP
        v_current_date := v_week_start + v_day;
        IF v_current_date >= p_local_start_date AND v_current_date <= v_horizon THEN
          PERFORM insert_series_event_instance(
            v_series_id, v_event.family_id, v_event.created_by, p_calendar_id,
            p_title, p_description, p_is_all_day,
            v_start_time, v_end_time, v_current_date, p_reminder_minutes, p_label_color
          );
          v_count := v_count + 1;
        END IF;
      END LOOP;
      v_week_start := v_week_start + (p_interval * 7 || ' days')::interval;
    END LOOP;
  ELSIF p_freq = 'monthly' THEN
    v_current_date := p_local_start_date;
    WHILE date_trunc('month', v_current_date)::date <= date_trunc('month', v_horizon)::date LOOP
      v_occurrence := (
        date_trunc('month', v_current_date) + (v_day_of_month - 1) * interval '1 day'
      )::date;
      IF EXTRACT(MONTH FROM v_occurrence) = EXTRACT(MONTH FROM date_trunc('month', v_current_date))
         AND v_occurrence >= p_local_start_date
         AND v_occurrence <= v_horizon
      THEN
        PERFORM insert_series_event_instance(
          v_series_id, v_event.family_id, v_event.created_by, p_calendar_id,
          p_title, p_description, p_is_all_day,
          v_start_time, v_end_time, v_occurrence, p_reminder_minutes, p_label_color
        );
        v_count := v_count + 1;
      END IF;
      v_current_date := (
        date_trunc('month', v_current_date) + (p_interval || ' months')::interval
      )::date;
    END LOOP;
  ELSE
    v_current_date := p_local_start_date;
    WHILE v_current_date <= v_horizon LOOP
      PERFORM insert_series_event_instance(
        v_series_id, v_event.family_id, v_event.created_by, p_calendar_id,
        p_title, p_description, p_is_all_day,
        v_start_time, v_end_time, v_current_date, p_reminder_minutes, p_label_color
      );
      v_count := v_count + 1;
      v_current_date := (v_current_date + (p_interval || ' years')::interval)::date;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'is_changed', true,
    'family_id', v_event.family_id,
    'new_calendar_id', p_calendar_id,
    'new_title', p_title,
    'new_start_at', p_start_at,
    'series_id', v_series_id,
    'event_count', v_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION convert_event_to_recurring_series_authorized(
  uuid, uuid, uuid, text, text, timestamptz, timestamptz, date, date,
  boolean, integer[], text, integer, integer[], integer, date, text, date
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION convert_event_to_recurring_series_authorized(
  uuid, uuid, uuid, text, text, timestamptz, timestamptz, date, date,
  boolean, integer[], text, integer, integer[], integer, date, text, date
) TO service_role;
