-- Align event update push-change detection across single and recurring events.
-- Reminder and label color edits still persist, but do not trigger event-change push notifications.

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
  p_has_label_color  boolean DEFAULT false
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
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
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

  IF p_reminder_minutes IS NOT NULL THEN
    DELETE FROM event_reminders WHERE event_id = p_event_id;
    IF cardinality(p_reminder_minutes) > 0 THEN
      INSERT INTO event_reminders (event_id, remind_minutes_before)
      SELECT p_event_id, unnest(p_reminder_minutes);
    END IF;
  END IF;

  RETURN json_build_object(
    'is_changed',      v_is_changed,
    'family_id',       v_event.family_id,
    'new_calendar_id', v_resolved_cal_id,
    'new_title',       COALESCE(p_title, v_event.title),
    'new_start_at',    COALESCE(p_start_at, v_event.start_at)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION update_event_authorized(
  uuid, uuid, text, text, boolean, timestamptz, timestamptz, boolean, boolean, uuid, boolean, integer[], text, boolean
) FROM public, anon, authenticated;

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
  p_has_label_color        boolean DEFAULT false
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
BEGIN
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
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
    v_resolved_occurrence_date := COALESCE(p_start_at, v_event.start_at)::date;
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

    IF p_reminder_minutes IS NOT NULL THEN
      DELETE FROM event_reminders WHERE event_id = p_event_id;
      IF cardinality(p_reminder_minutes) > 0 THEN
        INSERT INTO event_reminders (event_id, remind_minutes_before)
        SELECT p_event_id, unnest(p_reminder_minutes);
      END IF;
    END IF;

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
          WHEN COALESCE(p_is_all_day, ev.is_all_day) THEN (ev.series_occurrence_date::text || 'T00:00:00Z')::timestamptz
          WHEN p_start_time IS NOT NULL THEN (ev.series_occurrence_date::text || 'T' || p_start_time::text || 'Z')::timestamptz
          ELSE ev.start_at
        END AS next_start_at,
        CASE
          WHEN COALESCE(p_is_all_day, ev.is_all_day) THEN (ev.series_occurrence_date::text || 'T00:00:00Z')::timestamptz
          WHEN p_end_time IS NOT NULL THEN (ev.series_occurrence_date::text || 'T' || p_end_time::text || 'Z')::timestamptz
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
      calendar_id = CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE calendar_id END,
      label_color = CASE WHEN p_has_label_color THEN p_label_color ELSE label_color END
    WHERE series_id = v_event.series_id
      AND NOT is_cancelled
      AND (
        p_scope = 'all'
        OR series_occurrence_date >= p_anchor_occurrence_date
      );

    UPDATE recurrence_series SET
      title            = COALESCE(p_title, title),
      description      = CASE WHEN p_has_description THEN p_description ELSE description END,
      start_time       = COALESCE(p_start_time, start_time),
      end_time         = COALESCE(p_end_time, end_time),
      is_all_day       = COALESCE(p_is_all_day, is_all_day),
      calendar_id      = CASE WHEN p_has_calendar_id THEN p_calendar_id ELSE calendar_id END,
      reminder_minutes = COALESCE(p_reminder_minutes, reminder_minutes)
    WHERE id = v_event.series_id;

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

REVOKE EXECUTE ON FUNCTION update_series_authorized(
  uuid, uuid, text, date, text, text, boolean, timestamptz, timestamptz, boolean, time, time, boolean, uuid, boolean, int[], text, boolean
) FROM public, anon, authenticated;

DROP FUNCTION IF EXISTS update_series_authorized(
  uuid, uuid, text, date, text, text, boolean, time, time, boolean, uuid, boolean, int[], text, boolean
);
