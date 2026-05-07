-- Re-apply the latest following split RPC body because the original
-- 20260505001000 migration version had already been recorded remotely before
-- review fixes changed its file contents.

CREATE OR REPLACE FUNCTION split_recurring_series_following_authorized(
  p_actor_user_id          uuid,
  p_event_id               uuid,
  p_anchor_occurrence_date date,
  p_local_start_date        date,
  p_title                  text,
  p_description            text,
  p_has_description        boolean,
  p_start_at               timestamptz,
  p_end_at                 timestamptz,
  p_has_end_at             boolean,
  p_is_all_day             boolean,
  p_calendar_id            uuid,
  p_has_calendar_id        boolean,
  p_reminder_minutes       int[],
  p_label_color            text DEFAULT NULL,
  p_has_label_color        boolean DEFAULT false,
  p_freq                   text DEFAULT NULL,
  p_interval               int DEFAULT NULL,
  p_days_of_week           int[] DEFAULT NULL,
  p_day_of_month           int DEFAULT NULL,
  p_end_date               date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event            events%rowtype;
  v_series           recurrence_series%rowtype;
  v_rule             recurrence_rules%rowtype;
  v_has_access       boolean;
  v_new_rule_id      uuid;
  v_new_series_id    uuid;
  v_family_id        uuid;
  v_calendar_id      uuid;
  v_title            text;
  v_description      text;
  v_is_all_day       boolean;
  v_start_date       date;
  v_horizon          date;
  v_start_time       time;
  v_end_time         time;
  v_reminder_minutes int[];
  v_label_color      text;
  v_freq             text;
  v_interval         int;
  v_days_of_week     int[];
  v_day_of_month     int;
  v_end_date         date;
  v_current_date     date;
  v_eff_days         int[];
  v_dow              int;
  v_week_start       date;
  v_dom              int;
  v_occ              date;
  v_count            int := 0;
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_event.series_id IS NULL THEN RAISE EXCEPTION 'not_series_event'; END IF;

  IF p_anchor_occurrence_date IS NULL THEN RAISE EXCEPTION 'anchor_required'; END IF;
  IF p_local_start_date IS NULL THEN RAISE EXCEPTION 'local_start_date_required'; END IF;
  IF p_start_at IS NULL THEN RAISE EXCEPTION 'start_at_required'; END IF;

  SELECT * INTO v_series FROM recurrence_series WHERE id = v_event.series_id;
  IF NOT FOUND OR v_series.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  SELECT * INTO v_rule FROM recurrence_rules WHERE id = v_series.rule_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_event.calendar_id IS NOT NULL THEN
    SELECT (
      EXISTS(SELECT 1 FROM calendars WHERE id = v_event.calendar_id AND family_id = v_event.family_id)
      AND EXISTS(SELECT 1 FROM calendar_members WHERE calendar_id = v_event.calendar_id AND user_id = p_actor_user_id)
    ) INTO v_has_access;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM family_members WHERE family_id = v_event.family_id AND user_id = p_actor_user_id
    ) INTO v_has_access;
  END IF;
  IF NOT v_has_access THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_calendar_id := CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE v_event.calendar_id END;

  IF p_has_calendar_id AND p_calendar_id IS NOT NULL AND p_calendar_id IS DISTINCT FROM v_event.calendar_id THEN
    SELECT (
      EXISTS(SELECT 1 FROM calendars WHERE id = p_calendar_id AND family_id = v_event.family_id)
      AND EXISTS(SELECT 1 FROM calendar_members WHERE calendar_id = p_calendar_id AND user_id = p_actor_user_id)
    ) INTO v_has_access;
    IF NOT v_has_access THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  v_start_date := p_local_start_date;
  IF v_start_date < p_anchor_occurrence_date THEN
    RAISE EXCEPTION 'invalid_start_date';
  END IF;

  v_family_id := v_event.family_id;
  v_title := COALESCE(p_title, v_event.title);
  v_description := CASE WHEN p_has_description THEN p_description ELSE v_event.description END;
  v_is_all_day := COALESCE(p_is_all_day, v_event.is_all_day);
  v_reminder_minutes := COALESCE(p_reminder_minutes, v_series.reminder_minutes);
  v_label_color := CASE WHEN p_has_label_color THEN p_label_color ELSE v_event.label_color END;

  IF NOT v_is_all_day THEN
    v_start_time := p_start_at::time;
    v_end_time := COALESCE(
      CASE WHEN p_has_end_at THEN p_end_at ELSE v_event.end_at END,
      p_start_at
    )::time;
  END IF;

  v_freq := COALESCE(p_freq, v_rule.freq);
  v_interval := COALESCE(p_interval, v_rule.interval);
  IF v_freq NOT IN ('daily', 'weekly', 'monthly', 'yearly') THEN RAISE EXCEPTION 'invalid_frequency'; END IF;
  IF v_interval < 1 THEN RAISE EXCEPTION 'invalid_interval'; END IF;

  v_days_of_week := CASE
    WHEN v_freq = 'weekly' THEN COALESCE(
      CASE WHEN p_days_of_week IS NOT NULL AND cardinality(p_days_of_week) > 0 THEN p_days_of_week END,
      ARRAY[EXTRACT(DOW FROM v_start_date)::int]
    )
    ELSE COALESCE(p_days_of_week, v_rule.days_of_week)
  END;

  v_day_of_month := CASE
    WHEN v_freq = 'monthly' THEN COALESCE(p_day_of_month, EXTRACT(DAY FROM v_start_date)::int)
    ELSE COALESCE(p_day_of_month, v_rule.day_of_month)
  END;

  v_end_date := COALESCE(p_end_date, v_rule.end_date);
  IF v_end_date IS NOT NULL AND v_end_date < v_start_date THEN
    RAISE EXCEPTION 'no_future_occurrences';
  END IF;

  v_horizon := LEAST(
    COALESCE(v_end_date, (v_start_date + INTERVAL '1 year')::date),
    (v_start_date + INTERVAL '2 years')::date
  );

  INSERT INTO recurrence_rules (freq, interval, days_of_week, day_of_month, end_date)
  VALUES (v_freq, v_interval, v_days_of_week, v_day_of_month, v_end_date)
  RETURNING id INTO v_new_rule_id;

  INSERT INTO recurrence_series (
    family_id, calendar_id, title, description, is_all_day,
    start_time, end_time, reminder_minutes, rule_id, created_by
  ) VALUES (
    v_family_id, v_calendar_id, v_title, v_description, v_is_all_day,
    v_start_time, v_end_time, v_reminder_minutes, v_new_rule_id, p_actor_user_id
  )
  RETURNING id INTO v_new_series_id;

  IF v_freq = 'daily' THEN
    v_current_date := v_start_date;
    WHILE v_current_date <= v_horizon LOOP
      PERFORM insert_series_event_instance(
        v_new_series_id, v_family_id, p_actor_user_id, v_calendar_id,
        v_title, v_description, v_is_all_day,
        v_start_time, v_end_time, v_current_date, v_reminder_minutes, v_label_color
      );
      v_count := v_count + 1;
      v_current_date := v_current_date + (v_interval || ' days')::INTERVAL;
    END LOOP;

  ELSIF v_freq = 'weekly' THEN
    v_eff_days := v_days_of_week;
    v_week_start := v_start_date - EXTRACT(DOW FROM v_start_date)::int;
    WHILE v_week_start <= v_horizon LOOP
      FOREACH v_dow IN ARRAY v_eff_days LOOP
        v_current_date := v_week_start + v_dow;
        IF v_current_date >= v_start_date AND v_current_date <= v_horizon THEN
          PERFORM insert_series_event_instance(
            v_new_series_id, v_family_id, p_actor_user_id, v_calendar_id,
            v_title, v_description, v_is_all_day,
            v_start_time, v_end_time, v_current_date, v_reminder_minutes, v_label_color
          );
          v_count := v_count + 1;
        END IF;
      END LOOP;
      v_week_start := v_week_start + (v_interval * 7 || ' days')::INTERVAL;
    END LOOP;

  ELSIF v_freq = 'monthly' THEN
    v_dom := COALESCE(v_day_of_month, EXTRACT(DAY FROM v_start_date)::int);
    v_current_date := v_start_date;
    WHILE DATE_TRUNC('month', v_current_date)::date <= DATE_TRUNC('month', v_horizon)::date LOOP
      v_occ := (DATE_TRUNC('month', v_current_date) + (v_dom - 1) * INTERVAL '1 day')::date;
      IF EXTRACT(MONTH FROM v_occ) = EXTRACT(MONTH FROM DATE_TRUNC('month', v_current_date))
         AND v_occ >= v_start_date AND v_occ <= v_horizon
      THEN
        PERFORM insert_series_event_instance(
          v_new_series_id, v_family_id, p_actor_user_id, v_calendar_id,
          v_title, v_description, v_is_all_day,
          v_start_time, v_end_time, v_occ, v_reminder_minutes, v_label_color
        );
        v_count := v_count + 1;
      END IF;
      v_current_date := (DATE_TRUNC('month', v_current_date) + (v_interval || ' months')::INTERVAL)::date;
    END LOOP;

  ELSIF v_freq = 'yearly' THEN
    v_current_date := v_start_date;
    WHILE v_current_date <= v_horizon LOOP
      PERFORM insert_series_event_instance(
        v_new_series_id, v_family_id, p_actor_user_id, v_calendar_id,
        v_title, v_description, v_is_all_day,
        v_start_time, v_end_time, v_current_date, v_reminder_minutes, v_label_color
      );
      v_count := v_count + 1;
      v_current_date := (v_current_date + (v_interval || ' years')::INTERVAL)::date;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'invalid_frequency';
  END IF;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'no_future_occurrences';
  END IF;

  UPDATE events SET is_cancelled = true
  WHERE series_id = v_event.series_id
    AND NOT is_cancelled
    AND series_occurrence_date >= p_anchor_occurrence_date;

  DELETE FROM event_reminders er
  USING events ev
  WHERE er.event_id = ev.id
    AND ev.series_id = v_event.series_id
    AND ev.series_occurrence_date >= p_anchor_occurrence_date;

  UPDATE recurrence_rules
  SET end_date = p_anchor_occurrence_date - 1
  WHERE id = v_series.rule_id
    AND (end_date IS NULL OR end_date > p_anchor_occurrence_date - 1);

  RETURN json_build_object(
    'is_changed',      true,
    'family_id',       v_family_id,
    'series_id',       v_new_series_id,
    'old_series_id',   v_event.series_id,
    'scope',           'following',
    'event_count',     v_count,
    'new_calendar_id', v_calendar_id,
    'new_title',       v_title,
    'new_start_at',    p_start_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION split_recurring_series_following_authorized(
  uuid, uuid, date, date, text, text, boolean, timestamptz, timestamptz, boolean,
  boolean, uuid, boolean, int[], text, boolean, text, int, int[], int, date
) FROM public, anon, authenticated;

DROP FUNCTION IF EXISTS split_recurring_series_following_authorized(
  uuid, uuid, date, text, text, boolean, timestamptz, timestamptz, boolean,
  boolean, uuid, boolean, int[], text, boolean, text, int, int[], int, date
);
