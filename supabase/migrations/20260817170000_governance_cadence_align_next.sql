-- Align previous / next meeting with cadence start, type, and placeholder end.
-- Next = first series date on or after today; previous = the occurrence before it.
-- Weekly / Fortnightly stay on the start weekday (+7 / +14 calendar days).

ALTER TABLE public.governance_channels
  ADD COLUMN IF NOT EXISTS cadence_start date,
  ADD COLUMN IF NOT EXISTS cadence_end date;

CREATE OR REPLACE FUNCTION public.governance_occurrence_at(
  p_start date,
  p_cadence text,
  p_n integer
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  origin date;
BEGIN
  IF p_start IS NULL THEN
    RETURN NULL;
  END IF;
  origin := public.governance_snap_weekday(p_start, CASE WHEN coalesce(p_n, 0) >= 0 THEN 'forward' ELSE 'back' END);
  CASE p_cadence
    WHEN 'Daily' THEN
      RETURN public.governance_add_weekdays(origin, p_n);
    WHEN 'Weekly' THEN
      RETURN origin + (p_n * 7);
    WHEN 'Fortnightly' THEN
      RETURN origin + (p_n * 14);
    WHEN 'Monthly' THEN
      RETURN public.governance_add_months_weekday(origin, p_n);
    WHEN 'Quarterly' THEN
      RETURN public.governance_add_months_weekday(origin, p_n * 3);
    WHEN 'Half-yearly' THEN
      RETURN public.governance_add_months_weekday(origin, p_n * 6);
    WHEN 'Annual' THEN
      RETURN public.governance_add_months_weekday(origin, p_n * 12);
    ELSE
      RETURN CASE WHEN p_n = 0 THEN origin ELSE NULL END;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.governance_occurrence_at(date, text, integer) IS
  'Nth meeting from cadence start. Weekly keeps the start weekday; monthly adds months from start then snaps to a weekday.';

CREATE OR REPLACE FUNCTION public.governance_suggest_next_meeting(p_last date, p_cadence text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_last IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN public.governance_occurrence_at(p_last, p_cadence, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_sync_meeting_dates(
  p_start date,
  p_end date,
  p_cadence text,
  p_today date DEFAULT CURRENT_DATE
)
RETURNS TABLE(last_meeting date, next_meeting date)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  origin date;
  stop date;
  cur date;
  prev date := NULL;
  n int := 0;
BEGIN
  last_meeting := NULL;
  next_meeting := NULL;
  IF p_start IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;
  origin := public.governance_snap_weekday(p_start, 'forward');
  stop := coalesce(p_end, public.governance_default_cadence_end(origin));
  IF stop < origin THEN
    stop := public.governance_default_cadence_end(origin);
  END IF;

  IF p_cadence IS NULL OR p_cadence = 'Ad-hoc' THEN
    IF origin <= stop THEN
      IF origin >= p_today THEN
        next_meeting := origin;
      ELSE
        last_meeting := origin;
      END IF;
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  WHILE n < 400 LOOP
    cur := public.governance_occurrence_at(origin, p_cadence, n);
    IF cur IS NULL OR cur > stop THEN
      EXIT;
    END IF;
    IF cur >= p_today THEN
      next_meeting := cur;
      last_meeting := prev;
      RETURN NEXT;
      RETURN;
    END IF;
    prev := cur;
    n := n + 1;
  END LOOP;

  last_meeting := prev;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.governance_sync_meeting_dates(date, date, text, date) IS
  'Next = first series date on or after today (through end). Previous = the occurrence immediately before next.';

UPDATE public.governance_channels c
SET
  last_meeting = s.last_meeting,
  next_meeting = s.next_meeting
FROM LATERAL public.governance_sync_meeting_dates(
  coalesce(c.cadence_start, c.last_meeting, c.next_meeting, CURRENT_DATE),
  coalesce(c.cadence_end, public.governance_default_cadence_end(
    public.governance_snap_weekday(coalesce(c.cadence_start, c.last_meeting, c.next_meeting, CURRENT_DATE), 'forward')
  )),
  c.cadence,
  CURRENT_DATE
) s
WHERE c.status IS DISTINCT FROM 'Retired';

GRANT EXECUTE ON FUNCTION public.governance_occurrence_at(date, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_occurrence_at(date, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.governance_suggest_next_meeting(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_suggest_next_meeting(date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.governance_sync_meeting_dates(date, date, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_sync_meeting_dates(date, date, text, date) TO service_role;
