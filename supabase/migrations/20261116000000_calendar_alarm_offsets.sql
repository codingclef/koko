-- Existing positive values are minutes. Negative values are calendar months.
ALTER TABLE public.event_reminders
  DROP CONSTRAINT event_reminders_remind_minutes_before_check,
  ADD CONSTRAINT event_reminders_valid_offset
    CHECK (remind_minutes_before > 0 OR remind_minutes_before BETWEEN -12 AND -1),
  ADD COLUMN eligible_from timestamptz,
  ADD COLUMN claim_token uuid;

-- Existing rows keep their original delivery eligibility.
ALTER TABLE public.event_reminders ALTER COLUMN eligible_from SET DEFAULT now();

CREATE FUNCTION public.event_reminder_due_at(p_start timestamptz, p_all_day boolean, p_offset integer)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE STRICT
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_offset < 0 AND p_all_day THEN
      (((p_start AT TIME ZONE 'Asia/Tokyo')::date + make_interval(months => p_offset))::date
        + time '08:00') AT TIME ZONE 'Asia/Tokyo'
    WHEN p_offset < 0 THEN
      ((p_start AT TIME ZONE 'Asia/Tokyo') + make_interval(months => p_offset)) AT TIME ZONE 'Asia/Tokyo'
    WHEN p_all_day AND p_offset >= 1440 AND mod(p_offset, 1440) = 0 THEN
      ((p_start AT TIME ZONE 'Asia/Tokyo')::date - p_offset / 1440
        + time '08:00') AT TIME ZONE 'Asia/Tokyo'
    ELSE p_start - make_interval(mins => p_offset)
  END;
$$;

CREATE FUNCTION public.is_event_reminder_choice(p_offset integer, p_all_day boolean)
RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT
SET search_path = public, pg_temp
AS $$
  SELECT p_offset BETWEEN -12 AND -1
    OR (p_offset BETWEEN 1440 AND 8640 AND mod(p_offset, 1440) = 0)
    OR (p_offset BETWEEN 10080 AND 40320 AND mod(p_offset, 10080) = 0)
    OR (NOT p_all_day AND (
      (p_offset BETWEEN 5 AND 55 AND mod(p_offset, 5) = 0)
      OR (p_offset BETWEEN 60 AND 1380 AND mod(p_offset, 60) = 0)
    ));
$$;

CREATE FUNCTION public.resolve_event_reminder_offsets(
  p_event_id uuid, p_offsets integer[], p_was_all_day boolean, p_all_day boolean,
  p_use_reminder_offsets boolean, p_reject_invalid boolean DEFAULT true
)
RETURNS integer[]
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offsets integer[];
  v_eligible integer[];
BEGIN
  IF p_offsets IS NULL THEN RETURN NULL; END IF;

  -- A minutes-only client cannot remove a month rule added by a newer client.
  SELECT ARRAY(
    SELECT DISTINCT incoming FROM unnest(p_offsets) AS requested(incoming)
    WHERE p_use_reminder_offsets OR incoming > 0
    UNION
    SELECT er.remind_minutes_before
    FROM event_reminders er
    WHERE er.event_id = p_event_id AND er.remind_minutes_before < 0 AND NOT p_use_reminder_offsets
  ) INTO v_offsets;

  SELECT ARRAY(
    SELECT incoming FROM unnest(v_offsets) AS requested(incoming)
    WHERE is_event_reminder_choice(incoming, p_all_day)
      OR (incoming > 0
        AND (NOT p_all_day OR p_was_all_day OR mod(incoming, 1440) = 0)
        AND EXISTS (
          SELECT 1 FROM event_reminders er WHERE er.event_id = p_event_id AND er.remind_minutes_before = incoming
        ))
  ) INTO v_eligible;

  IF p_reject_invalid AND cardinality(v_offsets) <> cardinality(v_eligible) THEN
    RAISE EXCEPTION 'invalid_reminder_offsets';
  END IF;
  RETURN v_eligible;
END;
$$;

CREATE FUNCTION public.replace_event_reminder_offsets(
  p_event_id uuid, p_offsets integer[], p_previous_event_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event events%rowtype;
BEGIN
  IF p_offsets IS NULL THEN RETURN; END IF;
  SELECT * INTO STRICT v_event FROM events WHERE id = p_event_id FOR UPDATE;

  INSERT INTO event_reminders (event_id, remind_minutes_before, eligible_from, claimed_at, sent_at, claim_token)
  SELECT p_event_id, incoming,
    CASE WHEN previous.id IS NULL THEN now() ELSE previous.eligible_from END,
    previous.claimed_at, previous.sent_at, previous.claim_token
  FROM unnest(p_offsets) AS requested(incoming)
  LEFT JOIN LATERAL (
    SELECT er.id, er.eligible_from, er.claimed_at, er.sent_at, er.claim_token
    FROM event_reminders er JOIN events original ON original.id = er.event_id
    WHERE er.event_id = coalesce(p_previous_event_id, p_event_id)
      AND event_reminder_due_at(original.start_at, original.is_all_day, er.remind_minutes_before)
        = event_reminder_due_at(v_event.start_at, v_event.is_all_day, incoming)
    ORDER BY er.sent_at DESC NULLS LAST, er.claimed_at DESC NULLS LAST, er.eligible_from ASC NULLS FIRST
    LIMIT 1
  ) previous ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM event_reminders current
    WHERE current.event_id = p_event_id AND current.remind_minutes_before = incoming
  );

  DELETE FROM event_reminders er
  WHERE er.event_id = p_event_id AND NOT (er.remind_minutes_before = ANY(p_offsets));
END;
$$;

CREATE FUNCTION public.reschedule_event_reminders()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE event_reminders er
  SET eligible_from = now(), claimed_at = NULL, sent_at = NULL, claim_token = NULL
  WHERE er.event_id = new.id
    AND event_reminder_due_at(old.start_at, old.is_all_day, er.remind_minutes_before)
      IS DISTINCT FROM event_reminder_due_at(new.start_at, new.is_all_day, er.remind_minutes_before);
  RETURN new;
END;
$$;

CREATE TRIGGER reschedule_event_reminders
AFTER UPDATE OF start_at, is_all_day ON public.events
FOR EACH ROW
WHEN (old.start_at IS DISTINCT FROM new.start_at OR old.is_all_day IS DISTINCT FROM new.is_all_day)
EXECUTE FUNCTION public.reschedule_event_reminders();

REVOKE EXECUTE ON FUNCTION public.event_reminder_due_at(timestamptz, boolean, integer),
  public.is_event_reminder_choice(integer, boolean),
  public.resolve_event_reminder_offsets(uuid, integer[], boolean, boolean, boolean, boolean),
  public.replace_event_reminder_offsets(uuid, integer[], uuid),
  public.reschedule_event_reminders()
FROM public, anon, authenticated;

DROP FUNCTION public.claim_due_reminders();

CREATE OR REPLACE FUNCTION public.claim_due_reminders()
RETURNS TABLE (
  reminder_id uuid, event_title text, event_start timestamptz, is_all_day boolean,
  family_id uuid, calendar_id uuid, claim_token uuid
)
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql
AS $$
  WITH due AS MATERIALIZED (
    SELECT er.id, er.event_id, er.eligible_from,
      event_reminder_due_at(e.start_at, e.is_all_day, er.remind_minutes_before) AS scheduled_at
    FROM event_reminders er JOIN events e ON e.id = er.event_id
    WHERE er.sent_at IS NULL AND NOT coalesce(e.is_cancelled, false)
      AND (er.claimed_at IS NULL OR er.claimed_at < now() - interval '10 minutes')
  ),
  locked_events AS MATERIALIZED (
    SELECT e.id FROM events e
    WHERE EXISTS (
      SELECT 1 FROM due d WHERE d.event_id = e.id
        AND d.scheduled_at BETWEEN now() - interval '1 hour' AND now() + interval '5 seconds'
        AND (d.eligible_from IS NULL OR d.scheduled_at >= d.eligible_from)
    )
    ORDER BY e.id
    FOR UPDATE OF e SKIP LOCKED
  ),
  claim_groups AS MATERIALIZED (
    SELECT d.event_id, d.scheduled_at, gen_random_uuid() AS token
    FROM due d JOIN locked_events locked ON locked.id = d.event_id
    WHERE d.scheduled_at BETWEEN now() - interval '1 hour' AND now() + interval '5 seconds'
    GROUP BY d.event_id, d.scheduled_at
  )
  UPDATE event_reminders er
  SET claimed_at = now(), claim_token = claim_groups.token
  FROM due d JOIN claim_groups USING (event_id, scheduled_at)
  JOIN events e ON e.id = claim_groups.event_id
  WHERE er.id = d.id AND er.sent_at IS NULL
    AND (er.claimed_at IS NULL OR er.claimed_at < now() - interval '10 minutes')
    AND d.scheduled_at BETWEEN now() - interval '1 hour' AND now() + interval '5 seconds'
    AND (er.eligible_from IS NULL OR d.scheduled_at >= er.eligible_from)
    AND d.scheduled_at = event_reminder_due_at(e.start_at, e.is_all_day, er.remind_minutes_before)
    AND NOT EXISTS (
      SELECT 1 FROM event_reminders sibling
      WHERE sibling.event_id = e.id
        AND (sibling.sent_at IS NOT NULL OR sibling.claimed_at >= now() - interval '10 minutes')
        AND event_reminder_due_at(e.start_at, e.is_all_day, sibling.remind_minutes_before) = d.scheduled_at
    )
  RETURNING er.id, e.title, e.start_at, e.is_all_day, e.family_id, e.calendar_id, er.claim_token;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_due_reminders() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_reminders() TO service_role;

DROP FUNCTION public.acknowledge_reminders(uuid[]);

CREATE OR REPLACE FUNCTION public.acknowledge_reminders(
  p_reminder_ids uuid[], p_claim_tokens uuid[] DEFAULT NULL
)
RETURNS integer
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  -- Serialize acknowledgement with an edit that moves or replaces a claimed rule.
  PERFORM e.id FROM events e
  WHERE EXISTS (
    SELECT 1 FROM event_reminders er
    WHERE er.event_id = e.id AND er.sent_at IS NULL
      AND CASE WHEN p_claim_tokens IS NULL THEN er.id = ANY(p_reminder_ids)
               ELSE er.claim_token = ANY(p_claim_tokens) END
  )
  ORDER BY e.id
  FOR UPDATE OF e;

  UPDATE event_reminders
  SET sent_at = now(), claimed_at = NULL, claim_token = NULL
  WHERE sent_at IS NULL
    AND CASE WHEN p_claim_tokens IS NULL THEN id = ANY(p_reminder_ids)
             ELSE claim_token = ANY(p_claim_tokens) END;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acknowledge_reminders(uuid[], uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_reminders(uuid[], uuid[]) TO service_role;

-- Keep the existing recurrence and authorization paths.
CREATE OR REPLACE FUNCTION insert_series_event_instance(
  p_series_id      uuid,
  p_family_id      uuid,
  p_created_by     uuid,
  p_calendar_id    uuid,
  p_title          text,
  p_description    text,
  p_is_all_day     boolean,
  p_start_time     time,
  p_end_time       time,
  p_occ_date       date,
  p_reminder_mins  int[],
  p_label_color    text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start_at timestamptz;
  v_end_at   timestamptz;
  v_event_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM events
    WHERE series_id = p_series_id
      AND series_occurrence_date = p_occ_date
  ) THEN
    RETURN;
  END IF;

  IF p_is_all_day THEN
    v_start_at := (p_occ_date + time '00:00') AT TIME ZONE 'Asia/Tokyo';
    v_end_at   := v_start_at;
  ELSE
    v_start_at := (p_occ_date + (p_start_time + interval '9 hours')) AT TIME ZONE 'Asia/Tokyo';
    v_end_at   := (p_occ_date + (p_end_time + interval '9 hours')) AT TIME ZONE 'Asia/Tokyo';
    IF v_end_at < v_start_at THEN v_end_at := v_end_at + interval '1 day'; END IF;
  END IF;

  INSERT INTO events (
    family_id, created_by, calendar_id,
    title, description, start_at, end_at, is_all_day,
    series_id, series_occurrence_date, label_color
  ) VALUES (
    p_family_id, p_created_by, p_calendar_id,
    p_title, p_description, v_start_at, v_end_at, p_is_all_day,
    p_series_id, p_occ_date, p_label_color
  )
  RETURNING id INTO v_event_id;

  IF v_event_id IS NOT NULL AND cardinality(p_reminder_mins) > 0 THEN
    INSERT INTO event_reminders (event_id, remind_minutes_before)
    SELECT v_event_id, unnest(p_reminder_mins);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION create_recurring_series_authorized(
  p_actor_user_id    uuid,
  p_calendar_id      uuid,
  p_title            text,
  p_description      text,
  p_start_at         timestamptz,
  p_end_at           timestamptz,
  p_is_all_day       boolean,
  p_reminder_minutes int[],
  p_freq             text,
  p_interval         int,
  p_days_of_week     int[],
  p_day_of_month     int,
  p_end_date         date,
  p_label_color      text DEFAULT NULL
)
RETURNS TABLE (series_id uuid, event_count int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_family_id    uuid;
  v_rule_id      uuid;
  v_series_id    uuid;
  v_horizon      date;
  v_start_date   date;
  v_current_date date;
  v_start_time   time;
  v_end_time     time;
  v_count        int := 0;
  v_eff_days     int[];
  v_dow          int;
  v_week_start   date;
  v_dom          int;
  v_occ          date;
BEGIN
  SELECT fm.family_id INTO v_family_id
  FROM family_members fm WHERE fm.user_id = p_actor_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_family'; END IF;

  IF p_calendar_id IS NOT NULL THEN
    IF NOT (
      EXISTS (SELECT 1 FROM calendars c WHERE c.id = p_calendar_id AND c.family_id = v_family_id)
      AND EXISTS (SELECT 1 FROM calendar_members cm WHERE cm.calendar_id = p_calendar_id AND cm.user_id = p_actor_user_id)
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  v_start_date := (p_start_at AT TIME ZONE 'Asia/Tokyo')::date;

  v_horizon := LEAST(
    COALESCE(p_end_date, (v_start_date + INTERVAL '1 year')::date),
    (v_start_date + INTERVAL '2 years')::date
  );

  IF NOT p_is_all_day THEN
    v_start_time := (p_start_at AT TIME ZONE 'UTC')::time;
    v_end_time   := (COALESCE(p_end_at, p_start_at) AT TIME ZONE 'UTC')::time;
  END IF;

  INSERT INTO recurrence_rules (freq, interval, days_of_week, day_of_month, end_date)
  VALUES (p_freq, p_interval, p_days_of_week, p_day_of_month, p_end_date)
  RETURNING id INTO v_rule_id;

  INSERT INTO recurrence_series (
    family_id, calendar_id, title, description, is_all_day,
    start_time, end_time, reminder_minutes, rule_id, created_by
  ) VALUES (
    v_family_id, p_calendar_id, p_title, p_description, p_is_all_day,
    v_start_time, v_end_time, p_reminder_minutes, v_rule_id, p_actor_user_id
  )
  RETURNING id INTO v_series_id;

  IF p_freq = 'daily' THEN
    v_current_date := v_start_date;
    WHILE v_current_date <= v_horizon LOOP
      PERFORM insert_series_event_instance(
        v_series_id, v_family_id, p_actor_user_id, p_calendar_id,
        p_title, p_description, p_is_all_day,
        v_start_time, v_end_time, v_current_date, p_reminder_minutes, p_label_color
      );
      v_count := v_count + 1;
      v_current_date := v_current_date + (p_interval || ' days')::INTERVAL;
    END LOOP;

  ELSIF p_freq = 'weekly' THEN
    v_eff_days := COALESCE(
      CASE WHEN cardinality(p_days_of_week) > 0 THEN p_days_of_week END,
      ARRAY[EXTRACT(DOW FROM v_start_date)::int]
    );
    v_week_start := v_start_date - EXTRACT(DOW FROM v_start_date)::int;
    WHILE v_week_start <= v_horizon LOOP
      FOREACH v_dow IN ARRAY v_eff_days LOOP
        v_current_date := v_week_start + v_dow;
        IF v_current_date >= v_start_date AND v_current_date <= v_horizon THEN
          PERFORM insert_series_event_instance(
            v_series_id, v_family_id, p_actor_user_id, p_calendar_id,
            p_title, p_description, p_is_all_day,
            v_start_time, v_end_time, v_current_date, p_reminder_minutes, p_label_color
          );
          v_count := v_count + 1;
        END IF;
      END LOOP;
      v_week_start := v_week_start + (p_interval * 7 || ' days')::INTERVAL;
    END LOOP;

  ELSIF p_freq = 'monthly' THEN
    v_dom := COALESCE(p_day_of_month, EXTRACT(DAY FROM v_start_date)::int);
    v_current_date := v_start_date;
    WHILE DATE_TRUNC('month', v_current_date)::date <= DATE_TRUNC('month', v_horizon)::date LOOP
      v_occ := (DATE_TRUNC('month', v_current_date) + (v_dom - 1) * INTERVAL '1 day')::date;
      IF EXTRACT(MONTH FROM v_occ) = EXTRACT(MONTH FROM DATE_TRUNC('month', v_current_date))
         AND v_occ >= v_start_date AND v_occ <= v_horizon
      THEN
        PERFORM insert_series_event_instance(
          v_series_id, v_family_id, p_actor_user_id, p_calendar_id,
          p_title, p_description, p_is_all_day,
          v_start_time, v_end_time, v_occ, p_reminder_minutes, p_label_color
        );
        v_count := v_count + 1;
      END IF;
      v_current_date := (DATE_TRUNC('month', v_current_date) + (p_interval || ' months')::INTERVAL)::date;
    END LOOP;

  ELSIF p_freq = 'yearly' THEN
    v_current_date := v_start_date;
    WHILE v_current_date <= v_horizon LOOP
      PERFORM insert_series_event_instance(
        v_series_id, v_family_id, p_actor_user_id, p_calendar_id,
        p_title, p_description, p_is_all_day,
        v_start_time, v_end_time, v_current_date, p_reminder_minutes, p_label_color
      );
      v_count := v_count + 1;
      v_current_date := (v_current_date + (p_interval || ' years')::INTERVAL)::date;
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_series_id, v_count;
END;
$$;

-- Authorized update functions preserve reminder rows unless their rules change.
DROP FUNCTION public.update_event_authorized(uuid, uuid, text, text, boolean, timestamptz, timestamptz, boolean, boolean, uuid, boolean, integer[], text, boolean);

CREATE OR REPLACE FUNCTION update_event_authorized(
  p_actor_user_id    uuid,
  p_event_id         uuid,
  p_title            text,
  p_description      text,
  p_has_description  boolean,
  p_start_at         timestamptz,
  p_end_at           timestamptz,
  p_has_end_at       boolean,
  p_is_all_day       boolean,
  p_calendar_id      uuid,
  p_has_calendar_id  boolean,
  p_reminder_minutes integer[],
  p_label_color      text    DEFAULT NULL,
  p_has_label_color  boolean DEFAULT false,
  p_use_reminder_offsets boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event            events%rowtype;
  v_has_access       boolean;
  v_resolved_cal_id  uuid;
  v_is_changed       boolean;
  v_offsets           integer[];
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_event.calendar_id IS NOT NULL THEN
    SELECT (
      EXISTS(SELECT 1 FROM calendars        WHERE id = v_event.calendar_id AND family_id = v_event.family_id)
      AND EXISTS(SELECT 1 FROM calendar_members WHERE calendar_id = v_event.calendar_id AND user_id = p_actor_user_id)
    ) INTO v_has_access;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM family_members WHERE family_id = v_event.family_id AND user_id = p_actor_user_id
    ) INTO v_has_access;
  END IF;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_resolved_cal_id := CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE v_event.calendar_id END;

  IF p_has_calendar_id
     AND p_calendar_id IS NOT NULL
     AND p_calendar_id IS DISTINCT FROM v_event.calendar_id
  THEN
    SELECT (
      EXISTS(SELECT 1 FROM calendars WHERE id = p_calendar_id AND family_id = v_event.family_id)
      AND EXISTS(SELECT 1 FROM calendar_members WHERE calendar_id = p_calendar_id AND user_id = p_actor_user_id)
    ) INTO v_has_access;

    IF NOT v_has_access THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  v_is_changed := (
    (p_title IS NOT NULL AND p_title IS DISTINCT FROM v_event.title) OR
    (p_has_description AND CASE WHEN p_has_description THEN p_description ELSE v_event.description END IS DISTINCT FROM v_event.description) OR
    (p_start_at IS NOT NULL AND p_start_at IS DISTINCT FROM v_event.start_at) OR
    (p_has_end_at AND CASE WHEN p_has_end_at THEN p_end_at ELSE v_event.end_at END IS DISTINCT FROM v_event.end_at) OR
    (p_is_all_day IS NOT NULL AND p_is_all_day IS DISTINCT FROM v_event.is_all_day) OR
    (p_has_calendar_id AND v_resolved_cal_id IS DISTINCT FROM v_event.calendar_id)
  );

  UPDATE events SET
    title       = COALESCE(p_title, title),
    description = CASE WHEN p_has_description THEN p_description ELSE description END,
    start_at    = COALESCE(p_start_at, start_at),
    end_at      = CASE WHEN p_has_end_at THEN p_end_at ELSE end_at END,
    is_all_day  = COALESCE(p_is_all_day, is_all_day),
    calendar_id = v_resolved_cal_id,
    label_color = CASE WHEN p_has_label_color THEN p_label_color ELSE label_color END
  WHERE id = p_event_id;

  v_offsets := p_reminder_minutes;
  IF v_offsets IS NULL AND p_is_all_day AND NOT v_event.is_all_day THEN
    v_offsets := ARRAY(SELECT remind_minutes_before FROM event_reminders WHERE event_id = p_event_id);
  END IF;
  PERFORM replace_event_reminder_offsets(p_event_id, resolve_event_reminder_offsets(
    p_event_id, v_offsets, v_event.is_all_day, COALESCE(p_is_all_day, v_event.is_all_day), p_use_reminder_offsets
  ));

  RETURN json_build_object(
    'is_changed',      v_is_changed,
    'family_id',       v_event.family_id,
    'new_calendar_id', v_resolved_cal_id,
    'new_title',       COALESCE(p_title, v_event.title),
    'new_start_at',    COALESCE(p_start_at, v_event.start_at)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_event_authorized(uuid, uuid, text, text, boolean, timestamptz, timestamptz, boolean, boolean, uuid, boolean, integer[], text, boolean, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_event_authorized(uuid, uuid, text, text, boolean, timestamptz, timestamptz, boolean, boolean, uuid, boolean, integer[], text, boolean, boolean) TO service_role;

DROP FUNCTION public.update_series_authorized(uuid, uuid, text, date, text, text, boolean, timestamptz, timestamptz, boolean, time, time, boolean, uuid, boolean, int[], text, boolean);

CREATE OR REPLACE FUNCTION update_series_authorized(
  p_actor_user_id          uuid,
  p_event_id               uuid,
  p_scope                  text,
  p_anchor_occurrence_date date,
  p_title                  text,
  p_description            text,
  p_has_description        boolean,
  p_start_at               timestamptz,
  p_end_at                 timestamptz,
  p_has_end_at             boolean,
  p_start_time             time,
  p_end_time               time,
  p_is_all_day             boolean,
  p_calendar_id            uuid,
  p_has_calendar_id        boolean,
  p_reminder_minutes       int[],
  p_label_color            text    DEFAULT NULL,
  p_has_label_color        boolean DEFAULT false,
  p_use_reminder_offsets boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event      events%rowtype;
  v_has_access boolean;
  v_resolved_occurrence_date date;
  v_is_changed boolean;
  v_new_start_at timestamptz;
  v_offsets integer[];
  v_target events%rowtype;
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_event.series_id IS NULL THEN RAISE EXCEPTION 'not_series_event'; END IF;

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

  IF p_has_calendar_id AND p_calendar_id IS NOT NULL AND p_calendar_id IS DISTINCT FROM v_event.calendar_id THEN
    SELECT (
      EXISTS(SELECT 1 FROM calendars WHERE id = p_calendar_id AND family_id = v_event.family_id)
      AND EXISTS(SELECT 1 FROM calendar_members WHERE calendar_id = p_calendar_id AND user_id = p_actor_user_id)
    ) INTO v_has_access;
    IF NOT v_has_access THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  IF p_scope = 'single' THEN
    v_resolved_occurrence_date := CASE
      WHEN p_start_at IS NULL OR p_start_at = v_event.start_at THEN v_event.series_occurrence_date
      ELSE (p_start_at AT TIME ZONE 'Asia/Tokyo')::date
    END;
    v_new_start_at := COALESCE(p_start_at, v_event.start_at);
    v_is_changed := (
      (p_title IS NOT NULL AND p_title IS DISTINCT FROM v_event.title) OR
      (p_has_description AND CASE WHEN p_has_description THEN p_description ELSE v_event.description END IS DISTINCT FROM v_event.description) OR
      (p_start_at IS NOT NULL AND p_start_at IS DISTINCT FROM v_event.start_at) OR
      (p_has_end_at AND CASE WHEN p_has_end_at THEN p_end_at ELSE v_event.end_at END IS DISTINCT FROM v_event.end_at) OR
      (p_is_all_day IS NOT NULL AND p_is_all_day IS DISTINCT FROM v_event.is_all_day) OR
      (p_has_calendar_id AND CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE v_event.calendar_id END IS DISTINCT FROM v_event.calendar_id)
    );

    UPDATE events SET
      title       = COALESCE(p_title, title),
      description = CASE WHEN p_has_description THEN p_description ELSE description END,
      start_at    = COALESCE(p_start_at, start_at),
      end_at      = CASE WHEN p_has_end_at THEN p_end_at ELSE end_at END,
      is_all_day  = COALESCE(p_is_all_day, is_all_day),
      calendar_id = CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE calendar_id END,
      series_occurrence_date = v_resolved_occurrence_date,
      label_color = CASE WHEN p_has_label_color THEN p_label_color ELSE label_color END
    WHERE id = p_event_id;

    v_offsets := p_reminder_minutes;
    IF v_offsets IS NULL AND p_is_all_day AND NOT v_event.is_all_day THEN
      v_offsets := ARRAY(SELECT remind_minutes_before FROM event_reminders WHERE event_id = p_event_id);
    END IF;
    PERFORM replace_event_reminder_offsets(p_event_id, resolve_event_reminder_offsets(
      p_event_id, v_offsets, v_event.is_all_day, COALESCE(p_is_all_day, v_event.is_all_day), p_use_reminder_offsets
    ));

  ELSIF p_scope IN ('following', 'all') THEN
    WITH candidate_events AS (
      SELECT
        ev.series_occurrence_date,
        ev.start_at,
        ev.title,
        ev.description,
        ev.end_at,
        ev.is_all_day,
        ev.calendar_id,
        CASE
          WHEN p_is_all_day AND NOT ev.is_all_day THEN ((ev.start_at AT TIME ZONE 'Asia/Tokyo')::date + time '00:00') AT TIME ZONE 'Asia/Tokyo'
          WHEN p_start_time IS NOT NULL THEN
            ((ev.start_at AT TIME ZONE 'Asia/Tokyo')::date + (p_start_time + interval '9 hours')) AT TIME ZONE 'Asia/Tokyo'
          ELSE ev.start_at
        END AS next_start_at,
        CASE
          WHEN p_is_all_day AND NOT ev.is_all_day THEN ((ev.start_at AT TIME ZONE 'Asia/Tokyo')::date + time '00:00') AT TIME ZONE 'Asia/Tokyo'
          WHEN p_end_time IS NOT NULL THEN
            ((coalesce(ev.end_at, ev.start_at) AT TIME ZONE 'Asia/Tokyo')::date + (p_end_time + interval '9 hours')) AT TIME ZONE 'Asia/Tokyo'
          ELSE ev.end_at
        END AS next_end_at
      FROM events ev
      WHERE ev.series_id = v_event.series_id
        AND NOT ev.is_cancelled
        AND (
          p_scope = 'all'
          OR ev.series_occurrence_date >= p_anchor_occurrence_date
        )
    ),
    changed_events AS (
      SELECT *
      FROM candidate_events
      WHERE
        (p_title IS NOT NULL AND p_title IS DISTINCT FROM title) OR
        (p_has_description AND CASE WHEN p_has_description THEN p_description ELSE description END IS DISTINCT FROM description) OR
        (next_start_at IS DISTINCT FROM start_at) OR
        (next_end_at IS DISTINCT FROM end_at) OR
        (p_is_all_day IS NOT NULL AND p_is_all_day IS DISTINCT FROM is_all_day) OR
        (p_has_calendar_id AND CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE calendar_id END IS DISTINCT FROM calendar_id)
    )
    SELECT
      EXISTS(SELECT 1 FROM changed_events),
      COALESCE(
        (
          SELECT next_start_at
          FROM changed_events
          ORDER BY series_occurrence_date ASC, start_at ASC
          LIMIT 1
        ),
        v_event.start_at
      )
    INTO v_is_changed, v_new_start_at;

    UPDATE events SET
      title       = COALESCE(p_title, title),
      description = CASE WHEN p_has_description THEN p_description ELSE description END,
      start_at    = CASE
                      WHEN p_is_all_day AND NOT is_all_day THEN ((start_at AT TIME ZONE 'Asia/Tokyo')::date + time '00:00') AT TIME ZONE 'Asia/Tokyo'
                      WHEN p_start_time IS NOT NULL THEN
                        ((start_at AT TIME ZONE 'Asia/Tokyo')::date + (p_start_time + interval '9 hours')) AT TIME ZONE 'Asia/Tokyo'
                      ELSE start_at
                    END,
      end_at      = CASE
                      WHEN p_is_all_day AND NOT is_all_day THEN ((start_at AT TIME ZONE 'Asia/Tokyo')::date + time '00:00') AT TIME ZONE 'Asia/Tokyo'
                      WHEN p_end_time IS NOT NULL THEN
                        ((coalesce(end_at, start_at) AT TIME ZONE 'Asia/Tokyo')::date + (p_end_time + interval '9 hours')) AT TIME ZONE 'Asia/Tokyo'
                      ELSE end_at
                    END,
      is_all_day  = COALESCE(p_is_all_day, is_all_day),
      calendar_id = CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE calendar_id END,
      label_color = CASE WHEN p_has_label_color THEN p_label_color ELSE label_color END
    WHERE series_id = v_event.series_id
      AND NOT is_cancelled
      AND (
        p_scope = 'all'
        OR series_occurrence_date >= p_anchor_occurrence_date
      );

    v_offsets := resolve_event_reminder_offsets(
      p_event_id, p_reminder_minutes, v_event.is_all_day,
      COALESCE(p_is_all_day, v_event.is_all_day), p_use_reminder_offsets
    );

    UPDATE recurrence_series SET
      title            = COALESCE(p_title, title),
      description      = CASE WHEN p_has_description THEN p_description ELSE description END,
      start_time       = COALESCE(p_start_time, start_time),
      end_time         = COALESCE(p_end_time, end_time),
      is_all_day       = COALESCE(p_is_all_day, is_all_day),
      calendar_id      = CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE calendar_id END,
      reminder_minutes = CASE
        WHEN v_offsets IS NULL AND (p_is_all_day IS NULL OR p_is_all_day = is_all_day) THEN reminder_minutes
        ELSE ARRAY(
          SELECT DISTINCT offset_value FROM unnest(COALESCE(v_offsets, reminder_minutes)) AS offsets(offset_value)
          WHERE is_event_reminder_choice(offset_value, COALESCE(p_is_all_day, is_all_day))
          UNION
          SELECT offset_value FROM unnest(reminder_minutes) AS previous(offset_value)
          WHERE NOT p_use_reminder_offsets AND offset_value < 0
        )
      END
    WHERE id = v_event.series_id;

    IF v_offsets IS NOT NULL THEN
      FOR v_target IN
        SELECT * FROM events
        WHERE series_id = v_event.series_id AND NOT is_cancelled
          AND (p_scope = 'all' OR series_occurrence_date >= p_anchor_occurrence_date)
      LOOP
        PERFORM replace_event_reminder_offsets(v_target.id, resolve_event_reminder_offsets(
          v_target.id,
          CASE WHEN p_use_reminder_offsets OR v_target.id = p_event_id THEN v_offsets ELSE p_reminder_minutes END,
          v_event.is_all_day, v_target.is_all_day, p_use_reminder_offsets, false
        ));
      END LOOP;
    ELSIF p_is_all_day AND NOT v_event.is_all_day AND EXISTS (
      SELECT 1 FROM events ev JOIN event_reminders er ON er.event_id = ev.id
      WHERE ev.series_id = v_event.series_id AND NOT ev.is_cancelled
        AND (p_scope = 'all' OR ev.series_occurrence_date >= p_anchor_occurrence_date)
        AND er.remind_minutes_before > 0 AND mod(er.remind_minutes_before, 1440) <> 0
    ) THEN
      RAISE EXCEPTION 'invalid_reminder_offsets';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_scope';
  END IF;

  RETURN json_build_object(
    'is_changed',      v_is_changed,
    'family_id',       v_event.family_id,
    'series_id',       v_event.series_id,
    'scope',           p_scope,
    'new_title',       COALESCE(p_title, v_event.title),
    'new_start_at',    v_new_start_at,
    'new_calendar_id', CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE v_event.calendar_id END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_series_authorized(uuid, uuid, text, date, text, text, boolean, timestamptz, timestamptz, boolean, time, time, boolean, uuid, boolean, int[], text, boolean, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_series_authorized(uuid, uuid, text, date, text, text, boolean, timestamptz, timestamptz, boolean, time, time, boolean, uuid, boolean, int[], text, boolean, boolean) TO service_role;

DROP FUNCTION public.convert_event_to_recurring_series_authorized(uuid, uuid, uuid, text, text, timestamptz, timestamptz, date, date, boolean, integer[], text, integer, integer[], integer, date, text, date);

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
  p_today            date,
  p_use_reminder_offsets boolean DEFAULT false
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
  v_offsets        integer[];
  v_series_offsets integer[];
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

  v_offsets := resolve_event_reminder_offsets(
    p_event_id, p_reminder_minutes, v_event.is_all_day, p_is_all_day, p_use_reminder_offsets
  );
  v_series_offsets := ARRAY(
    SELECT offset_value FROM unnest(v_offsets) AS offsets(offset_value)
    WHERE is_event_reminder_choice(offset_value, p_is_all_day)
  );

  v_horizon := LEAST(
    COALESCE(p_end_date, (p_local_start_date + INTERVAL '1 year')::date),
    (p_local_start_date + INTERVAL '2 years')::date
  );

  IF NOT p_is_all_day THEN
    v_start_time := (p_start_at AT TIME ZONE 'UTC')::time;
    v_end_time := (p_end_at AT TIME ZONE 'UTC')::time;
  END IF;

  INSERT INTO recurrence_rules (freq, interval, days_of_week, day_of_month, end_date)
  VALUES (p_freq, p_interval, v_days_of_week, v_day_of_month, p_end_date)
  RETURNING id INTO v_rule_id;

  INSERT INTO recurrence_series (
    family_id, calendar_id, title, description, is_all_day,
    start_time, end_time, reminder_minutes, rule_id, created_by
  ) VALUES (
    v_event.family_id, p_calendar_id, p_title, p_description, p_is_all_day,
    v_start_time, v_end_time, v_series_offsets, v_rule_id, v_event.created_by
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

  PERFORM replace_event_reminder_offsets(p_event_id, v_offsets);

  IF p_freq = 'daily' THEN
    v_current_date := p_local_start_date;
    WHILE v_current_date <= v_horizon LOOP
      PERFORM insert_series_event_instance(
        v_series_id, v_event.family_id, v_event.created_by, p_calendar_id,
        p_title, p_description, p_is_all_day,
        v_start_time, v_end_time, v_current_date, v_series_offsets, p_label_color
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
            v_start_time, v_end_time, v_current_date, v_series_offsets, p_label_color
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
          v_start_time, v_end_time, v_occurrence, v_series_offsets, p_label_color
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
        v_start_time, v_end_time, v_current_date, v_series_offsets, p_label_color
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

REVOKE EXECUTE ON FUNCTION public.convert_event_to_recurring_series_authorized(uuid, uuid, uuid, text, text, timestamptz, timestamptz, date, date, boolean, integer[], text, integer, integer[], integer, date, text, date, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_event_to_recurring_series_authorized(uuid, uuid, uuid, text, text, timestamptz, timestamptz, date, date, boolean, integer[], text, integer, integer[], integer, date, text, date, boolean) TO service_role;

DROP FUNCTION public.split_recurring_series_following_authorized(uuid, uuid, date, date, text, text, boolean, timestamptz, timestamptz, boolean, boolean, uuid, boolean, int[], text, boolean, text, int, int[], int, date, boolean);

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
  p_end_date               date DEFAULT NULL,
  p_should_update_end_date boolean DEFAULT false,
  p_use_reminder_offsets boolean DEFAULT false
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
  v_requested_offsets int[];
  v_previous_offsets int[];
  v_offsets int[];
  v_target record;
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
  SELECT * INTO v_event FROM events WHERE id = p_event_id FOR UPDATE;
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

  PERFORM e.id FROM events e
  WHERE e.series_id = v_event.series_id AND NOT e.is_cancelled
    AND e.series_occurrence_date >= p_anchor_occurrence_date
  ORDER BY e.id
  FOR UPDATE OF e;

  v_family_id := v_event.family_id;
  v_title := COALESCE(p_title, v_event.title);
  v_description := CASE WHEN p_has_description THEN p_description ELSE v_event.description END;
  v_is_all_day := COALESCE(p_is_all_day, v_event.is_all_day);
  v_requested_offsets := resolve_event_reminder_offsets(
    p_event_id, p_reminder_minutes, v_event.is_all_day, v_is_all_day, p_use_reminder_offsets
  );
  v_reminder_minutes := ARRAY(
    SELECT DISTINCT offset_value
    FROM unnest(COALESCE(v_requested_offsets, v_series.reminder_minutes)) AS offsets(offset_value)
    WHERE is_event_reminder_choice(offset_value, v_is_all_day)
    UNION
    SELECT offset_value FROM unnest(v_series.reminder_minutes) AS previous(offset_value)
    WHERE NOT p_use_reminder_offsets AND offset_value < 0
  );
  v_label_color := CASE WHEN p_has_label_color THEN p_label_color ELSE v_event.label_color END;

  IF NOT v_is_all_day THEN
    v_start_time := (p_start_at AT TIME ZONE 'UTC')::time;
    v_end_time := COALESCE(
      CASE WHEN p_has_end_at THEN p_end_at ELSE v_event.end_at END,
      p_start_at
    ) AT TIME ZONE 'UTC';
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

  v_end_date := CASE
    WHEN p_should_update_end_date THEN p_end_date
    ELSE v_rule.end_date
  END;
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

  -- Keep the alarm settings and delivery state of occurrences regenerated on the same date.
  FOR v_target IN
    SELECT replacement.id AS new_id, original.id AS previous_id, original.is_all_day AS previous_all_day
    FROM events replacement
    JOIN LATERAL (
      SELECT e.id, e.is_all_day FROM events e
      WHERE e.series_id = v_event.series_id AND NOT e.is_cancelled
        AND e.series_occurrence_date >= p_anchor_occurrence_date
        AND e.series_occurrence_date BETWEEN replacement.series_occurrence_date - 1 AND replacement.series_occurrence_date
        AND (e.start_at AT TIME ZONE 'Asia/Tokyo')::date = replacement.series_occurrence_date
      ORDER BY (e.start_at = replacement.start_at) DESC, e.series_occurrence_date
      LIMIT 1
    ) original ON true
    WHERE replacement.series_id = v_new_series_id
  LOOP
    v_previous_offsets := ARRAY(
      SELECT remind_minutes_before FROM event_reminders WHERE event_id = v_target.previous_id
    );
    v_offsets := resolve_event_reminder_offsets(
      v_target.previous_id,
      COALESCE(
        CASE WHEN p_use_reminder_offsets THEN v_requested_offsets ELSE p_reminder_minutes END,
        v_previous_offsets
      ),
      v_target.previous_all_day, v_is_all_day,
      p_use_reminder_offsets OR p_reminder_minutes IS NULL, false
    );
    DELETE FROM event_reminders WHERE event_id = v_target.new_id;
    PERFORM replace_event_reminder_offsets(v_target.new_id, v_offsets, v_target.previous_id);
  END LOOP;

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

REVOKE EXECUTE ON FUNCTION public.split_recurring_series_following_authorized(uuid, uuid, date, date, text, text, boolean, timestamptz, timestamptz, boolean, boolean, uuid, boolean, int[], text, boolean, text, int, int[], int, date, boolean, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.split_recurring_series_following_authorized(uuid, uuid, date, date, text, text, boolean, timestamptz, timestamptz, boolean, boolean, uuid, boolean, int[], text, boolean, text, int, int[], int, date, boolean, boolean) TO service_role;
