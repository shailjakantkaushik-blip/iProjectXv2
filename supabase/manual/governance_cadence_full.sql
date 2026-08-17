-- =============================================================================
-- iProjectX — ONE script: governance cadence (paste into SQL Editor → Run)
-- Then: Settings → API → Reload schema cache
-- Safe to re-run.
--
-- What it does:
--   Cadence start + placeholder end + cadence type generate weekday meetings.
--   Previous / next default from that series (aligned).
--   You can still CHANGE previous/next in Governance Framework when real life
--   moves a meeting; later calendar dates continue from the new next date.
-- Re-running this script fills start/end when missing and realigns previous/next
-- to cadence (same as Reset in the forum form). After that, change previous/next
-- in Governance Framework when a meeting moves in real life.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.governance_snap_weekday(p_date date, p_direction text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cur date := p_date;
  i int;
BEGIN
  IF p_date IS NULL THEN
    RETURN NULL;
  END IF;
  FOR i IN 1..7 LOOP
    IF EXTRACT(ISODOW FROM cur)::int <= 5 THEN
      RETURN cur;
    END IF;
    cur := cur + CASE WHEN lower(coalesce(p_direction, 'forward')) = 'back' THEN -1 ELSE 1 END;
  END LOOP;
  RETURN cur;
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_add_weekdays(p_date date, p_n integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cur date := p_date;
  left_n int;
  step int;
BEGIN
  IF p_date IS NULL THEN
    RETURN NULL;
  END IF;
  IF coalesce(p_n, 0) = 0 THEN
    RETURN public.governance_snap_weekday(p_date, 'forward');
  END IF;
  step := CASE WHEN p_n > 0 THEN 1 ELSE -1 END;
  left_n := abs(p_n);
  WHILE left_n > 0 LOOP
    cur := cur + step;
    IF EXTRACT(ISODOW FROM cur)::int <= 5 THEN
      left_n := left_n - 1;
    END IF;
  END LOOP;
  RETURN cur;
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_add_months_weekday(p_date date, p_months integer)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.governance_snap_weekday(
    (p_date + (p_months * INTERVAL '1 month'))::date,
    CASE WHEN p_months >= 0 THEN 'forward' ELSE 'back' END
  );
$$;

ALTER TABLE public.governance_channels
  ADD COLUMN IF NOT EXISTS cadence_start date,
  ADD COLUMN IF NOT EXISTS cadence_end date;

COMMENT ON COLUMN public.governance_channels.cadence_start IS
  'First meeting of the cadence series (weekday). Calendar expands from this date.';
COMMENT ON COLUMN public.governance_channels.cadence_end IS
  'Placeholder last meeting / planning horizon. Series stops here until the date is extended.';

ALTER TABLE public.governance_channels
  DROP CONSTRAINT IF EXISTS governance_channels_cadence_window_chk;
ALTER TABLE public.governance_channels
  ADD CONSTRAINT governance_channels_cadence_window_chk CHECK (
    cadence_start IS NULL OR cadence_end IS NULL OR cadence_end >= cadence_start
  );

CREATE OR REPLACE FUNCTION public.governance_default_cadence_end(p_start date)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.governance_snap_weekday((p_start + INTERVAL '12 months')::date, 'forward');
$$;

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

-- Plan window when missing.
UPDATE public.governance_channels c
SET
  cadence_start = public.governance_snap_weekday(
    coalesce(c.cadence_start, c.last_meeting, c.next_meeting, CURRENT_DATE),
    'forward'
  ),
  cadence_end = coalesce(
    c.cadence_end,
    GREATEST(
      public.governance_snap_weekday(coalesce(c.next_meeting, CURRENT_DATE), 'forward'),
      public.governance_default_cadence_end(
        public.governance_snap_weekday(
          coalesce(c.cadence_start, c.last_meeting, c.next_meeting, CURRENT_DATE),
          'forward'
        )
      )
    )
  )
WHERE c.cadence_start IS NULL OR c.cadence_end IS NULL;

-- Align previous/next to cadence (fixes leftover dates). After this, edit them in
-- Governance Framework when real life changes; the app keeps those edits.
UPDATE public.governance_channels c
SET
  last_meeting = s.last_meeting,
  next_meeting = s.next_meeting
FROM (
  SELECT
    g.id,
    d.last_meeting,
    d.next_meeting
  FROM public.governance_channels g
  CROSS JOIN LATERAL public.governance_sync_meeting_dates(
    coalesce(g.cadence_start, g.last_meeting, g.next_meeting, CURRENT_DATE),
    coalesce(
      g.cadence_end,
      public.governance_default_cadence_end(
        public.governance_snap_weekday(
          coalesce(g.cadence_start, g.last_meeting, g.next_meeting, CURRENT_DATE),
          'forward'
        )
      )
    ),
    g.cadence,
    CURRENT_DATE
  ) d
) s
WHERE c.id = s.id
  AND c.status IS DISTINCT FROM 'Retired';

CREATE OR REPLACE FUNCTION public.ensure_project_governance_forums(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proj public.projects%ROWTYPE;
  t RECORD;
  v_id uuid;
  v_prog uuid;
  v_sa uuid;
  v_next date;
  v_last date;
  v_start date;
  v_end date;
  v_cadence text;
  v_name text;
  v_purpose text;
  v_audience text;
BEGIN
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_start := public.governance_snap_weekday(CURRENT_DATE, 'forward');

  IF coalesce(btrim(v_proj.portfolio), '') <> '' THEN
    SELECT id INTO v_sa
    FROM public.governance_channels
    WHERE org_id = v_proj.org_id
      AND scope_level = 'strategic_alignment'
      AND portfolio IS NOT DISTINCT FROM v_proj.portfolio
    ORDER BY created_at
    LIMIT 1;

    IF v_sa IS NULL THEN
      SELECT name, cadence, purpose, audience
        INTO v_name, v_cadence, v_purpose, v_audience
      FROM public.governance_forum_templates
      WHERE org_id = v_proj.org_id AND scope_level = 'strategic_alignment' AND is_active
      ORDER BY sort_order, name
      LIMIT 1;

      v_name := coalesce(v_name, 'Strategic Alignment Review');
      v_cadence := coalesce(v_cadence, 'Monthly');
      v_purpose := coalesce(v_purpose, 'Investment health and escalations for this Strategic Alignment.');
      v_audience := coalesce(v_audience, 'Executives & Sponsors');
      v_end := public.governance_default_cadence_end(v_start);
      SELECT s.last_meeting, s.next_meeting INTO v_last, v_next
        FROM public.governance_sync_meeting_dates(v_start, v_end, v_cadence) s;

      INSERT INTO public.governance_channels (
        org_id, name, cadence, audience, purpose, chair,
        last_meeting, next_meeting, cadence_start, cadence_end, status,
        scope_level, portfolio
      ) VALUES (
        v_proj.org_id, v_name, v_cadence, v_audience, v_purpose, v_proj.sponsor,
        v_last, v_next, v_start, v_end, 'Active',
        'strategic_alignment', v_proj.portfolio
      )
      RETURNING id INTO v_sa;
    END IF;
  END IF;

  IF coalesce(btrim(v_proj.program), '') <> '' THEN
    SELECT id INTO v_prog
    FROM public.governance_channels
    WHERE org_id = v_proj.org_id
      AND scope_level = 'program'
      AND program IS NOT DISTINCT FROM v_proj.program
    ORDER BY created_at
    LIMIT 1;

    IF v_prog IS NULL THEN
      SELECT name, cadence, purpose, audience
        INTO v_name, v_cadence, v_purpose, v_audience
      FROM public.governance_forum_templates
      WHERE org_id = v_proj.org_id AND scope_level = 'program' AND is_active
      ORDER BY sort_order, name
      LIMIT 1;

      v_name := coalesce(v_name, 'Program Board');
      v_cadence := coalesce(v_cadence, 'Fortnightly');
      v_purpose := coalesce(v_purpose, 'Program RAG, dependencies, and escalations from project forums.');
      v_audience := coalesce(v_audience, 'Program & BU Leads');
      v_end := public.governance_default_cadence_end(v_start);
      SELECT s.last_meeting, s.next_meeting INTO v_last, v_next
        FROM public.governance_sync_meeting_dates(v_start, v_end, v_cadence) s;

      INSERT INTO public.governance_channels (
        org_id, name, cadence, audience, purpose, chair,
        last_meeting, next_meeting, cadence_start, cadence_end, status,
        scope_level, program, parent_channel_id
      ) VALUES (
        v_proj.org_id, v_name, v_cadence, v_audience, v_purpose, v_proj.sponsor,
        v_last, v_next, v_start, v_end, 'Active',
        'program', v_proj.program, v_sa
      )
      RETURNING id INTO v_prog;
    ELSIF v_sa IS NOT NULL THEN
      UPDATE public.governance_channels
      SET parent_channel_id = v_sa
      WHERE id = v_prog AND parent_channel_id IS NULL;
    END IF;
  END IF;

  FOR t IN
    SELECT *
    FROM public.governance_forum_templates
    WHERE org_id = v_proj.org_id AND scope_level = 'project' AND is_active
    ORDER BY sort_order, name
  LOOP
    SELECT id INTO v_id
    FROM public.governance_channels
    WHERE project_id = v_proj.id
      AND scope_level = 'project'
      AND lower(name) = lower(t.name)
    LIMIT 1;

    IF v_id IS NULL THEN
      v_end := coalesce(
        public.governance_snap_weekday(v_proj.planned_end_date, 'forward'),
        public.governance_default_cadence_end(v_start)
      );
      IF v_end < v_start THEN
        v_end := public.governance_default_cadence_end(v_start);
      END IF;
      SELECT s.last_meeting, s.next_meeting INTO v_last, v_next
        FROM public.governance_sync_meeting_dates(v_start, v_end, t.cadence) s;

      INSERT INTO public.governance_channels (
        org_id, name, cadence, audience, purpose, chair,
        last_meeting, next_meeting, cadence_start, cadence_end, status,
        scope_level, project_id, program, portfolio, parent_channel_id
      ) VALUES (
        v_proj.org_id, t.name, t.cadence,
        coalesce(t.audience, 'Project team'),
        t.purpose,
        coalesce(t.default_chair, v_proj.sponsor),
        v_last, v_next, v_start, v_end, 'Active',
        'project', v_proj.id, v_proj.program, v_proj.portfolio, v_prog
      )
      RETURNING id INTO v_id;
    ELSIF v_prog IS NOT NULL THEN
      UPDATE public.governance_channels
      SET parent_channel_id = v_prog
      WHERE id = v_id AND parent_channel_id IS NULL;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.governance_snap_weekday(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_snap_weekday(date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.governance_add_weekdays(date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_add_weekdays(date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.governance_add_months_weekday(date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_add_months_weekday(date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.governance_default_cadence_end(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_default_cadence_end(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.governance_occurrence_at(date, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_occurrence_at(date, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.governance_suggest_next_meeting(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_suggest_next_meeting(date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.governance_sync_meeting_dates(date, date, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_sync_meeting_dates(date, date, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_project_governance_forums(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_project_governance_forums(uuid) TO service_role;
