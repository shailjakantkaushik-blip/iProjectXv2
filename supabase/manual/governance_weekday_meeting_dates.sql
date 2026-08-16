-- Paste after governance_scoped_forums.sql (hosted SQL editor).
-- Governance meeting dates: previous occurrence by default, next from cadence,
-- counting Monday–Friday only. Ad-hoc keeps a previous weekday and leaves next empty.
-- CREATE OR REPLACE of ensure_project_governance_forums; does not rewrite existing rows.

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

CREATE OR REPLACE FUNCTION public.governance_suggest_next_meeting(p_last date, p_cadence text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_last IS NULL THEN
    RETURN NULL;
  END IF;
  CASE p_cadence
    WHEN 'Daily' THEN RETURN public.governance_add_weekdays(p_last, 1);
    WHEN 'Weekly' THEN RETURN public.governance_add_weekdays(p_last, 5);
    WHEN 'Fortnightly' THEN RETURN public.governance_add_weekdays(p_last, 10);
    WHEN 'Monthly' THEN RETURN public.governance_add_months_weekday(p_last, 1);
    WHEN 'Quarterly' THEN RETURN public.governance_add_months_weekday(p_last, 3);
    WHEN 'Half-yearly' THEN RETURN public.governance_add_months_weekday(p_last, 6);
    WHEN 'Annual' THEN RETURN public.governance_add_months_weekday(p_last, 12);
    ELSE RETURN NULL;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.governance_default_last_meeting(
  p_cadence text,
  p_today date DEFAULT CURRENT_DATE
)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  anchor date := public.governance_snap_weekday(p_today, 'back');
BEGIN
  CASE p_cadence
    WHEN 'Daily' THEN RETURN public.governance_add_weekdays(anchor, -1);
    WHEN 'Weekly' THEN RETURN public.governance_add_weekdays(anchor, -5);
    WHEN 'Fortnightly' THEN RETURN public.governance_add_weekdays(anchor, -10);
    WHEN 'Monthly' THEN RETURN public.governance_add_months_weekday(anchor, -1);
    WHEN 'Quarterly' THEN RETURN public.governance_add_months_weekday(anchor, -3);
    WHEN 'Half-yearly' THEN RETURN public.governance_add_months_weekday(anchor, -6);
    WHEN 'Annual' THEN RETURN public.governance_add_months_weekday(anchor, -12);
    ELSE RETURN public.governance_add_weekdays(anchor, -1);
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.governance_suggest_next_meeting(date, text) IS
  'Next meeting from last + cadence. Daily/Weekly/Fortnightly count weekdays; longer cadences add calendar months then snap to a weekday. Ad-hoc returns null.';

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
  v_cadence text;
  v_name text;
  v_purpose text;
  v_audience text;
BEGIN
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

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
      v_last := public.governance_default_last_meeting(v_cadence);
      v_next := public.governance_suggest_next_meeting(v_last, v_cadence);

      INSERT INTO public.governance_channels (
        org_id, name, cadence, audience, purpose, chair,
        last_meeting, next_meeting, status,
        scope_level, portfolio
      ) VALUES (
        v_proj.org_id, v_name, v_cadence, v_audience, v_purpose, v_proj.sponsor,
        v_last, v_next, 'Active',
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
      v_last := public.governance_default_last_meeting(v_cadence);
      v_next := public.governance_suggest_next_meeting(v_last, v_cadence);

      INSERT INTO public.governance_channels (
        org_id, name, cadence, audience, purpose, chair,
        last_meeting, next_meeting, status,
        scope_level, program, parent_channel_id
      ) VALUES (
        v_proj.org_id, v_name, v_cadence, v_audience, v_purpose, v_proj.sponsor,
        v_last, v_next, 'Active',
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
      v_last := public.governance_default_last_meeting(t.cadence);
      v_next := public.governance_suggest_next_meeting(v_last, t.cadence);

      INSERT INTO public.governance_channels (
        org_id, name, cadence, audience, purpose, chair,
        last_meeting, next_meeting, status,
        scope_level, project_id, program, portfolio, parent_channel_id
      ) VALUES (
        v_proj.org_id, t.name, t.cadence,
        coalesce(t.audience, 'Project team'),
        t.purpose,
        coalesce(t.default_chair, v_proj.sponsor),
        v_last, v_next, 'Active',
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

GRANT EXECUTE ON FUNCTION public.ensure_project_governance_forums(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_project_governance_forums(uuid) TO service_role;
