
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS override_max_users integer,
  ADD COLUMN IF NOT EXISTS override_max_projects integer;

CREATE OR REPLACE FUNCTION public.get_org_limits(_org_id uuid)
RETURNS TABLE(max_users integer, max_projects integer, plan_code text, plan_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(o.override_max_users, bp.max_users)    AS max_users,
    COALESCE(o.override_max_projects, bp.max_projects) AS max_projects,
    bp.code, bp.name
  FROM public.organizations o
  LEFT JOIN public.subscriptions s
    ON s.org_id = o.id AND s.status IN ('active','trialing','past_due')
  LEFT JOIN public.billing_plans bp ON bp.id = s.plan_id
  WHERE o.id = _org_id
  ORDER BY s.created_at DESC NULLS LAST
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_org_limits(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_enforce_project_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; used int;
BEGIN
  IF NEW.org_id IS NULL THEN RETURN NEW; END IF;
  SELECT max_projects INTO lim FROM public.get_org_limits(NEW.org_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO used FROM public.projects WHERE org_id = NEW.org_id;
  IF used >= lim THEN
    RAISE EXCEPTION 'Project limit reached for this organization (max % projects on current plan). Upgrade the plan or contact your administrator.', lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_project_limit ON public.projects;
CREATE TRIGGER trg_enforce_project_limit
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_project_limit();

CREATE OR REPLACE FUNCTION public.tg_enforce_user_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lim int; used int;
BEGIN
  IF NEW.org_id IS NULL THEN RETURN NEW; END IF;
  SELECT max_users INTO lim FROM public.get_org_limits(NEW.org_id);
  IF lim IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE org_id = NEW.org_id AND user_id = NEW.user_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RETURN NEW;
  END IF;
  SELECT COUNT(DISTINCT user_id) INTO used FROM public.user_roles WHERE org_id = NEW.org_id;
  IF used >= lim THEN
    RAISE EXCEPTION 'User limit reached for this organization (max % users on current plan). Upgrade the plan or contact your administrator.', lim
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_user_limit ON public.user_roles;
CREATE TRIGGER trg_enforce_user_limit
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_user_limit();
