-- Fix: convert_demand_idea_to_project RETURNS TABLE (id …) made unqualified
-- "id" ambiguous vs demand_pipeline.id / projects.id (42702).

CREATE OR REPLACE FUNCTION public.convert_demand_idea_to_project(_idea_id uuid)
RETURNS TABLE (id uuid, project_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  uid uuid := auth.uid();
  home uuid;
  idea public.demand_pipeline%ROWTYPE;
  base text;
  code text;
  proj public.projects%ROWTYPE;
  cost numeric;
  out_id uuid;
  out_code text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  home := public.get_user_org(uid);
  IF home IS NULL THEN
    RAISE EXCEPTION 'No organisation on your profile';
  END IF;

  IF NOT public.can_promote_demand(uid) THEN
    RAISE EXCEPTION 'Not allowed to create a project from demand. Ask an org admin or project manager.';
  END IF;

  SELECT d.* INTO idea
  FROM public.demand_pipeline AS d
  WHERE d.id = _idea_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demand idea not found';
  END IF;

  IF idea.org_id IS DISTINCT FROM home THEN
    RAISE EXCEPTION 'Demand idea is not in your organisation';
  END IF;

  IF idea.project_id IS NOT NULL THEN
    SELECT p.id, p.project_code
    INTO out_id, out_code
    FROM public.projects AS p
    WHERE p.id = idea.project_id;
    IF out_id IS NULL THEN
      RAISE EXCEPTION 'Demand is linked to a missing project';
    END IF;
    id := out_id;
    project_code := out_code;
    RETURN NEXT;
    RETURN;
  END IF;

  base := upper(regexp_replace(COALESCE(idea.idea_name, 'IDEA'), '[^A-Z0-9]+', '', 'g'));
  base := left(COALESCE(NULLIF(base, ''), 'NEW'), 8);
  code := 'DM-' || base || '-' || upper(left(replace(idea.id::text, '-', ''), 4));

  cost := COALESCE(idea.estimated_cost, 0);

  INSERT INTO public.projects (
    org_id,
    project_code,
    name,
    sponsor,
    status,
    rag,
    priority,
    delivery_method,
    budget,
    capex_approved,
    opex_approved,
    benefits_target,
    roi_percent,
    portfolio,
    pm_user_id
  ) VALUES (
    home,
    code,
    COALESCE(NULLIF(btrim(idea.idea_name), ''), 'Converted demand'),
    idea.sponsor,
    'Not Started',
    'Green',
    'Medium',
    'Hybrid',
    cost,
    CASE WHEN cost > 0 THEN round(cost * 0.6) ELSE 0 END,
    CASE WHEN cost > 0 THEN round(cost * 0.4) ELSE 0 END,
    COALESCE(idea.estimated_benefit, 0),
    idea.estimated_roi,
    'Business Strategic',
    uid
  )
  RETURNING * INTO proj;

  BEGIN
    UPDATE public.demand_pipeline AS d
    SET
      project_id = proj.id,
      status = 'Approved',
      converted_at = now(),
      converted_by = uid
    WHERE d.id = idea.id;
  EXCEPTION
    WHEN undefined_column THEN
      UPDATE public.demand_pipeline AS d
      SET project_id = proj.id, status = 'Approved'
      WHERE d.id = idea.id;
  END;

  id := proj.id;
  project_code := proj.project_code;
  RETURN NEXT;
END;
$$;
