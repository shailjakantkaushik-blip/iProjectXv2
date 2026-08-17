-- =============================================================================
-- iProjectX — Governance cadence window (paste into Supabase SQL Editor → Run)
-- Then: Settings → API → Reload schema (PostgREST schema cache)
-- Safe to re-run. Adds cadence_start / cadence_end and expands meetings on the
-- Governance Channel calendar from start through placeholder end by cadence type.
-- =============================================================================

-- Governance Framework: cadence start + placeholder end so the calendar can
-- expand weekday meetings from the forum cadence (Weekly, Monthly, …).

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

COMMENT ON FUNCTION public.governance_default_cadence_end(date) IS
  'Placeholder cadence end: 12 months after start, snapped to a weekday.';

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
  cur date;
  nxt date;
  stop date;
  n int := 0;
BEGIN
  last_meeting := NULL;
  next_meeting := NULL;
  IF p_start IS NULL THEN
    RETURN NEXT;
    RETURN;
  END IF;
  cur := public.governance_snap_weekday(p_start, 'forward');
  stop := coalesce(p_end, public.governance_default_cadence_end(cur));
  IF stop < cur THEN
    stop := public.governance_default_cadence_end(cur);
  END IF;

  IF p_cadence IS NULL OR p_cadence = 'Ad-hoc' THEN
    IF cur <= stop THEN
      IF cur <= p_today THEN last_meeting := cur; ELSE next_meeting := cur; END IF;
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  WHILE cur IS NOT NULL AND cur <= stop AND n < 400 LOOP
    IF cur <= p_today THEN
      last_meeting := cur;
    ELSIF next_meeting IS NULL THEN
      next_meeting := cur;
      EXIT;
    END IF;
    nxt := public.governance_suggest_next_meeting(cur, p_cadence);
    IF nxt IS NULL OR nxt <= cur THEN
      EXIT;
    END IF;
    cur := nxt;
    n := n + 1;
  END LOOP;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.governance_sync_meeting_dates(date, date, text, date) IS
  'Last = latest series date on or before today; next = first series date after today.';

-- Backfill existing forums: start from last (or next), end = max(existing next, start+12 months).
UPDATE public.governance_channels c
SET
  cadence_start = public.governance_snap_weekday(
    coalesce(c.last_meeting, c.next_meeting, CURRENT_DATE),
    'forward'
  ),
  cadence_end = GREATEST(
    public.governance_snap_weekday(coalesce(c.next_meeting, CURRENT_DATE), 'forward'),
    public.governance_default_cadence_end(
      public.governance_snap_weekday(coalesce(c.last_meeting, c.next_meeting, CURRENT_DATE), 'forward')
    )
  )
WHERE c.cadence_start IS NULL OR c.cadence_end IS NULL;

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

  -- Shared Strategic Alignment forum (one per portfolio value, or skip if blank).
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

  -- Shared program forum (one per program name).
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

  -- Project forums from active project templates.
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

GRANT EXECUTE ON FUNCTION public.governance_default_cadence_end(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_default_cadence_end(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.governance_sync_meeting_dates(date, date, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.governance_sync_meeting_dates(date, date, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_project_governance_forums(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_project_governance_forums(uuid) TO service_role;
