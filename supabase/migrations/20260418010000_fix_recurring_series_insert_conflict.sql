-- Fix recurring occurrence inserts on preview/prod databases.
-- The original helper used ON CONFLICT (series_id, series_occurrence_date),
-- but the supporting uniqueness is a partial unique index, which Postgres
-- cannot target with a column-list ON CONFLICT clause.

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
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_at   timestamptz;
  v_end_at     timestamptz;
  v_event_id   uuid;
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
