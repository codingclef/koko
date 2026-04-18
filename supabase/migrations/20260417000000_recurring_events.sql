-- ============================================================
-- Recurring Events
-- Tables: recurrence_rules, recurrence_series
-- Events: add series_id, series_occurrence_date, is_cancelled
-- RPCs: create_recurring_series_authorized
--       update_series_authorized
--       delete_series_authorized
-- ============================================================

-- ── Tables ───────────────────────────────────────────────────

CREATE TABLE recurrence_rules (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  freq            text        NOT NULL CHECK (freq IN ('daily','weekly','monthly','yearly')),
  interval        int         NOT NULL DEFAULT 1 CHECK (interval >= 1),
  days_of_week    int[]       NULL,
  day_of_month    int         NULL CHECK (day_of_month BETWEEN 1 AND 31),
  end_date        date        NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recurrence_series (
  id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  family_id        uuid        NOT NULL REFERENCES families(id)   ON DELETE CASCADE,
  calendar_id      uuid        NULL     REFERENCES calendars(id)  ON DELETE SET NULL,
  title            text        NOT NULL,
  description      text        NULL,
  is_all_day       boolean     NOT NULL DEFAULT true,
  start_time       time        NULL,
  end_time         time        NULL,
  reminder_minutes int[]       NOT NULL DEFAULT '{}',
  rule_id          uuid        NOT NULL REFERENCES recurrence_rules(id) ON DELETE RESTRICT,
  created_by       uuid        NOT NULL,
  deleted_at       timestamptz NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ── Events: new columns ───────────────────────────────────────

ALTER TABLE events
  ADD COLUMN series_id              uuid    NULL REFERENCES recurrence_series(id) ON DELETE SET NULL,
  ADD COLUMN series_occurrence_date date    NULL,
  ADD COLUMN is_cancelled           boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX events_series_occurrence_key
  ON events (series_id, series_occurrence_date)
  WHERE series_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE recurrence_rules   ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurrence_series  ENABLE ROW LEVEL SECURITY;

-- recurrence_rules: readable when referenced by a series the user's family owns
CREATE POLICY "select_recurrence_rules" ON recurrence_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM recurrence_series rs
      WHERE rs.rule_id = recurrence_rules.id
        AND rs.family_id IN (SELECT get_my_family_ids())
    )
  );

-- recurrence_series: readable by family members
CREATE POLICY "select_recurrence_series" ON recurrence_series
  FOR SELECT USING (family_id IN (SELECT get_my_family_ids()));

-- ── Helper: insert one series event instance ─────────────────

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
  p_reminder_mins  int[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start_at timestamptz;
  v_end_at   timestamptz;
  v_event_id uuid;
BEGIN
  IF p_is_all_day THEN
    v_start_at := p_occ_date::timestamptz;
    v_end_at   := p_occ_date::timestamptz;
  ELSE
    v_start_at := (p_occ_date::text || 'T' || p_start_time::text || 'Z')::timestamptz;
    v_end_at   := (p_occ_date::text || 'T' || p_end_time::text   || 'Z')::timestamptz;
  END IF;

  INSERT INTO events (
    family_id, created_by, calendar_id,
    title, description, start_at, end_at, is_all_day,
    series_id, series_occurrence_date
  ) VALUES (
    p_family_id, p_created_by, p_calendar_id,
    p_title, p_description, v_start_at, v_end_at, p_is_all_day,
    p_series_id, p_occ_date
  )
  ON CONFLICT (series_id, series_occurrence_date) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NOT NULL AND cardinality(p_reminder_mins) > 0 THEN
    INSERT INTO event_reminders (event_id, remind_minutes_before)
    SELECT v_event_id, unnest(p_reminder_mins);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION insert_series_event_instance(
  uuid, uuid, uuid, uuid, text, text, boolean, time, time, date, int[]
) FROM public, anon, authenticated;

-- ── RPC: create_recurring_series_authorized ──────────────────

CREATE OR REPLACE FUNCTION create_recurring_series_authorized(
  p_actor_user_id   uuid,
  p_calendar_id     uuid,
  p_title           text,
  p_description     text,
  p_start_at        timestamptz,
  p_end_at          timestamptz,
  p_is_all_day      boolean,
  p_reminder_minutes int[],
  p_freq            text,
  p_interval        int,
  p_days_of_week    int[],
  p_day_of_month    int,
  p_end_date        date
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
  -- Auth: get family
  SELECT fm.family_id INTO v_family_id
  FROM family_members fm WHERE fm.user_id = p_actor_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no_family'; END IF;

  -- Calendar access check
  IF p_calendar_id IS NOT NULL THEN
    IF NOT (
      EXISTS (SELECT 1 FROM calendars c WHERE c.id = p_calendar_id AND c.family_id = v_family_id)
      AND EXISTS (SELECT 1 FROM calendar_members cm WHERE cm.calendar_id = p_calendar_id AND cm.user_id = p_actor_user_id)
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  v_start_date := p_start_at::date;

  -- Materialize horizon: end_date or 1 year, capped at 2 years
  v_horizon := LEAST(
    COALESCE(p_end_date, (v_start_date + INTERVAL '1 year')::date),
    (v_start_date + INTERVAL '2 years')::date
  );

  IF NOT p_is_all_day THEN
    v_start_time := p_start_at::time;
    v_end_time   := COALESCE(p_end_at, p_start_at)::time;
  END IF;

  -- Create rule
  INSERT INTO recurrence_rules (freq, interval, days_of_week, day_of_month, end_date)
  VALUES (p_freq, p_interval, p_days_of_week, p_day_of_month, p_end_date)
  RETURNING id INTO v_rule_id;

  -- Create series template
  INSERT INTO recurrence_series (
    family_id, calendar_id, title, description, is_all_day,
    start_time, end_time, reminder_minutes, rule_id, created_by
  ) VALUES (
    v_family_id, p_calendar_id, p_title, p_description, p_is_all_day,
    v_start_time, v_end_time, p_reminder_minutes, v_rule_id, p_actor_user_id
  )
  RETURNING id INTO v_series_id;

  -- ── Generate occurrences ─────────────────────────────────
  IF p_freq = 'daily' THEN
    v_current_date := v_start_date;
    WHILE v_current_date <= v_horizon LOOP
      PERFORM insert_series_event_instance(
        v_series_id, v_family_id, p_actor_user_id, p_calendar_id,
        p_title, p_description, p_is_all_day,
        v_start_time, v_end_time, v_current_date, p_reminder_minutes
      );
      v_count := v_count + 1;
      v_current_date := v_current_date + (p_interval || ' days')::INTERVAL;
    END LOOP;

  ELSIF p_freq = 'weekly' THEN
    v_eff_days := COALESCE(
      CASE WHEN cardinality(p_days_of_week) > 0 THEN p_days_of_week END,
      ARRAY[EXTRACT(DOW FROM v_start_date)::int]
    );
    -- Start from the Sunday of the week containing v_start_date
    v_week_start := v_start_date - EXTRACT(DOW FROM v_start_date)::int;
    WHILE v_week_start <= v_horizon LOOP
      FOREACH v_dow IN ARRAY v_eff_days LOOP
        v_current_date := v_week_start + v_dow;
        IF v_current_date >= v_start_date AND v_current_date <= v_horizon THEN
          PERFORM insert_series_event_instance(
            v_series_id, v_family_id, p_actor_user_id, p_calendar_id,
            p_title, p_description, p_is_all_day,
            v_start_time, v_end_time, v_current_date, p_reminder_minutes
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
      -- Guard against month overflow (e.g. Feb 31 → Mar)
      IF EXTRACT(MONTH FROM v_occ) = EXTRACT(MONTH FROM DATE_TRUNC('month', v_current_date))
         AND v_occ >= v_start_date AND v_occ <= v_horizon
      THEN
        PERFORM insert_series_event_instance(
          v_series_id, v_family_id, p_actor_user_id, p_calendar_id,
          p_title, p_description, p_is_all_day,
          v_start_time, v_end_time, v_occ, p_reminder_minutes
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
        v_start_time, v_end_time, v_current_date, p_reminder_minutes
      );
      v_count := v_count + 1;
      v_current_date := (v_current_date + (p_interval || ' years')::INTERVAL)::date;
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_series_id, v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_recurring_series_authorized(
  uuid, uuid, text, text, timestamptz, timestamptz, boolean, int[], text, int, int[], int, date
) FROM public, anon, authenticated;

-- ── RPC: delete_series_authorized ────────────────────────────

CREATE OR REPLACE FUNCTION delete_series_authorized(
  p_actor_user_id         uuid,
  p_event_id              uuid,
  p_scope                 text,   -- 'single' | 'following' | 'all'
  p_anchor_occurrence_date date
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event       events%rowtype;
  v_series      recurrence_series%rowtype;
  v_has_access  boolean;
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_event.series_id IS NULL THEN RAISE EXCEPTION 'not_series_event'; END IF;

  -- Permission check (mirrors delete_event_authorized)
  IF v_event.calendar_id IS NOT NULL THEN
    SELECT (
      EXISTS(SELECT 1 FROM calendars        WHERE id          = v_event.calendar_id AND family_id = v_event.family_id)
      AND EXISTS(SELECT 1 FROM calendar_members WHERE calendar_id = v_event.calendar_id AND user_id  = p_actor_user_id)
    ) INTO v_has_access;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM family_members WHERE family_id = v_event.family_id AND user_id = p_actor_user_id
    ) INTO v_has_access;
  END IF;
  IF NOT v_has_access THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_series FROM recurrence_series WHERE id = v_event.series_id;

  IF p_scope = 'single' THEN
    UPDATE events SET is_cancelled = true WHERE id = p_event_id;
    DELETE FROM event_reminders WHERE event_id = p_event_id;

  ELSIF p_scope = 'following' THEN
    UPDATE events SET is_cancelled = true
    WHERE series_id = v_event.series_id
      AND series_occurrence_date >= p_anchor_occurrence_date;
    DELETE FROM event_reminders er
    USING events ev
    WHERE er.event_id = ev.id
      AND ev.series_id = v_event.series_id
      AND ev.series_occurrence_date >= p_anchor_occurrence_date;
    -- Trim rule end_date so future re-materialization stops before anchor
    UPDATE recurrence_rules SET end_date = p_anchor_occurrence_date - 1
    WHERE id = v_series.rule_id
      AND (end_date IS NULL OR end_date > p_anchor_occurrence_date - 1);

  ELSIF p_scope = 'all' THEN
    DELETE FROM event_reminders er
    USING events ev
    WHERE er.event_id = ev.id AND ev.series_id = v_event.series_id;
    UPDATE events SET is_cancelled = true WHERE series_id = v_event.series_id;
    UPDATE recurrence_series SET deleted_at = now() WHERE id = v_event.series_id;
  END IF;

  RETURN json_build_object(
    'family_id',   v_event.family_id,
    'calendar_id', v_event.calendar_id,
    'title',       v_event.title,
    'start_at',    v_event.start_at,
    'series_id',   v_event.series_id,
    'scope',       p_scope
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_series_authorized(uuid, uuid, text, date)
FROM public, anon, authenticated;

-- ── RPC: update_series_authorized ────────────────────────────

CREATE OR REPLACE FUNCTION update_series_authorized(
  p_actor_user_id          uuid,
  p_event_id               uuid,
  p_scope                  text,   -- 'single' | 'following' | 'all'
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
  p_reminder_minutes       int[]
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_event      events%rowtype;
  v_has_access boolean;
  v_resolved_occurrence_date date;
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v_event.series_id IS NULL THEN RAISE EXCEPTION 'not_series_event'; END IF;

  -- Permission check
  IF v_event.calendar_id IS NOT NULL THEN
    SELECT (
      EXISTS(SELECT 1 FROM calendars        WHERE id          = v_event.calendar_id AND family_id = v_event.family_id)
      AND EXISTS(SELECT 1 FROM calendar_members WHERE calendar_id = v_event.calendar_id AND user_id  = p_actor_user_id)
    ) INTO v_has_access;
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM family_members WHERE family_id = v_event.family_id AND user_id = p_actor_user_id
    ) INTO v_has_access;
  END IF;
  IF NOT v_has_access THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Check membership in target calendar when moving to a different calendar
  IF p_has_calendar_id AND p_calendar_id IS NOT NULL AND p_calendar_id IS DISTINCT FROM v_event.calendar_id THEN
    SELECT (
      EXISTS(SELECT 1 FROM calendars WHERE id = p_calendar_id AND family_id = v_event.family_id)
      AND EXISTS(SELECT 1 FROM calendar_members WHERE calendar_id = p_calendar_id AND user_id = p_actor_user_id)
    ) INTO v_has_access;
    IF NOT v_has_access THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  -- ── Apply update by scope ────────────────────────────────

  IF p_scope = 'single' THEN
    v_resolved_occurrence_date := COALESCE(p_start_at, v_event.start_at)::date;

    UPDATE events SET
      title       = COALESCE(p_title, title),
      description = CASE WHEN p_has_description THEN p_description ELSE description END,
      start_at    = COALESCE(p_start_at, start_at),
      end_at      = CASE WHEN p_has_end_at THEN p_end_at ELSE end_at END,
      is_all_day  = COALESCE(p_is_all_day, is_all_day),
      calendar_id = CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE calendar_id END,
      series_occurrence_date = v_resolved_occurrence_date
    WHERE id = p_event_id;

    IF p_reminder_minutes IS NOT NULL THEN
      DELETE FROM event_reminders WHERE event_id = p_event_id;
      IF cardinality(p_reminder_minutes) > 0 THEN
        INSERT INTO event_reminders (event_id, remind_minutes_before)
        SELECT p_event_id, unnest(p_reminder_minutes);
      END IF;
    END IF;

  ELSIF p_scope IN ('following', 'all') THEN
    UPDATE events SET
      title       = COALESCE(p_title, title),
      description = CASE WHEN p_has_description THEN p_description ELSE description END,
      start_at    = CASE
                      WHEN COALESCE(p_is_all_day, is_all_day) THEN (series_occurrence_date::text || 'T00:00:00Z')::timestamptz
                      WHEN p_start_time IS NOT NULL            THEN (series_occurrence_date::text || 'T' || p_start_time::text || 'Z')::timestamptz
                      ELSE start_at
                    END,
      end_at      = CASE
                      WHEN COALESCE(p_is_all_day, is_all_day) THEN (series_occurrence_date::text || 'T00:00:00Z')::timestamptz
                      WHEN p_end_time IS NOT NULL              THEN (series_occurrence_date::text || 'T' || p_end_time::text || 'Z')::timestamptz
                      ELSE end_at
                    END,
      is_all_day  = COALESCE(p_is_all_day, is_all_day),
      calendar_id = CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE calendar_id END
    WHERE series_id = v_event.series_id
      AND NOT is_cancelled
      AND (
        p_scope = 'all'
        OR series_occurrence_date >= p_anchor_occurrence_date
      );

    IF p_scope = 'all' THEN
      UPDATE recurrence_series SET
        title            = COALESCE(p_title, title),
        description      = CASE WHEN p_has_description THEN p_description ELSE description END,
        start_time       = COALESCE(p_start_time, start_time),
        end_time         = COALESCE(p_end_time, end_time),
        is_all_day       = COALESCE(p_is_all_day, is_all_day),
        calendar_id      = CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE calendar_id END,
        reminder_minutes = COALESCE(p_reminder_minutes, reminder_minutes)
      WHERE id = v_event.series_id;
    END IF;

    IF p_reminder_minutes IS NOT NULL THEN
      DELETE FROM event_reminders er
      USING events ev
      WHERE er.event_id = ev.id
        AND ev.series_id = v_event.series_id
        AND NOT ev.is_cancelled
        AND (p_scope = 'all' OR ev.series_occurrence_date >= p_anchor_occurrence_date);

      IF cardinality(p_reminder_minutes) > 0 THEN
        INSERT INTO event_reminders (event_id, remind_minutes_before)
        SELECT ev.id, unnest(p_reminder_minutes)
        FROM events ev
        WHERE ev.series_id = v_event.series_id
          AND NOT ev.is_cancelled
          AND (p_scope = 'all' OR ev.series_occurrence_date >= p_anchor_occurrence_date);
      END IF;
    END IF;
  END IF;

  RETURN json_build_object(
    'is_changed',  true,
    'family_id',   v_event.family_id,
    'series_id',   v_event.series_id,
    'scope',       p_scope,
    'new_title',   COALESCE(p_title, v_event.title),
    'new_start_at', v_event.start_at,
    'new_calendar_id', CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE v_event.calendar_id END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION update_series_authorized(
  uuid, uuid, text, date, text, text, boolean, timestamptz, timestamptz, boolean, time, time, boolean, uuid, boolean, int[]
) FROM public, anon, authenticated;
