-- Demand Pipeline → Create Project Link.
-- Direct INSERT into public.projects fails RLS for many authorised users:
--   projects_insert_admin requires has_any_admin(), and INSERT…RETURNING also
--   has to pass projects_read_org (user_can_view_project).
-- Promote through a SECURITY DEFINER RPC that enforces org tenancy + the same
-- roles already allowed to write demand_pipeline (admin / org_admin / pm / bu_lead).
-- Does not open general project INSERT to PMs.

-- Align admin check with has_role(): leftover admin rows with null org_id still count
-- for the user's home organisation (never another org).
CREATE OR REPLACE FUNCTION public.has_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN ('admin', 'org_admin')
      AND (
        ur.org_id IS NULL
        OR ur.org_id = public.get_user_org(_user_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_promote_demand(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_any_admin(_user_id)
    OR public.has_role(_user_id, 'pm')
    OR public.has_role(_user_id, 'bu_lead');
$$;

COMMENT ON FUNCTION public.can_promote_demand(uuid) IS
  'True when the user may convert a demand idea to a project in their home org (same roles as demand_pipeline write).';

CREATE OR REPLACE FUNCTION public.convert_demand_idea_to_project(_idea_id uuid)
RETURNS TABLE (id uuid, project_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  home uuid;
  idea public.demand_pipeline%ROWTYPE;
  base text;
  code text;
  proj public.projects%ROWTYPE;
  cost numeric;
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

  SELECT * INTO idea
  FROM public.demand_pipeline
  WHERE id = _idea_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demand idea not found';
  END IF;

  IF idea.org_id IS DISTINCT FROM home THEN
    RAISE EXCEPTION 'Demand idea is not in your organisation';
  END IF;

  IF idea.project_id IS NOT NULL THEN
    SELECT p.id, p.project_code
    INTO id, project_code
    FROM public.projects p
    WHERE p.id = idea.project_id;
    IF id IS NULL THEN
      RAISE EXCEPTION 'Demand is linked to a missing project';
    END IF;
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
    UPDATE public.demand_pipeline
    SET
      project_id = proj.id,
      status = 'Approved',
      converted_at = now(),
      converted_by = uid
    WHERE id = idea.id;
  EXCEPTION
    WHEN undefined_column THEN
      UPDATE public.demand_pipeline
      SET project_id = proj.id, status = 'Approved'
      WHERE id = idea.id;
  END;

  id := proj.id;
  project_code := proj.project_code;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.can_promote_demand(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_promote_demand(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.convert_demand_idea_to_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_demand_idea_to_project(uuid) TO authenticated;

-- Keep general project create admin-only (wizard / data editor). Index-friendly org predicate.
DROP POLICY IF EXISTS "projects_insert_admin" ON public.projects;
CREATE POLICY "projects_insert_admin"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (SELECT public.get_user_org(auth.uid()))
    AND public.has_any_admin(auth.uid())
  );
