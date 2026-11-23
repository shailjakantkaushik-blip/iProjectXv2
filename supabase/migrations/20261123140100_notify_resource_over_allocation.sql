-- Notify the resource's linked login and resource manager when a planner
-- confirms an assignment that exceeds leave/holiday-adjusted hours.
-- Title/body/link are fixed server-side so callers cannot spoof alerts.

DROP FUNCTION IF EXISTS public.notify_resource_over_allocation(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.notify_resource_over_allocation(uuid);

CREATE OR REPLACE FUNCTION public.notify_resource_over_allocation(_resource_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  uid uuid;
  mid uuid;
  rname text;
  n integer := 0;
  caller uuid := auth.uid();
  title_txt constant text := 'Over allocated (leave / holidays)';
  body_txt text;
  link_txt constant text := '/app/resources?tab=calendars';
BEGIN
  oid := public.get_user_org(caller);
  IF oid IS NULL THEN
    RAISE EXCEPTION 'not in an organisation';
  END IF;

  IF NOT (
    public.has_any_admin(caller)
    OR public.has_role(caller, 'pm')
    OR public.has_role(caller, 'bu_lead')
  ) THEN
    RAISE EXCEPTION 'not allowed to notify over-allocation';
  END IF;

  SELECT r.user_id, r.manager_user_id, r.name
    INTO uid, mid, rname
  FROM public.resources r
  WHERE r.id = _resource_id AND r.org_id = oid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resource not found';
  END IF;

  body_txt := coalesce(rname, 'A resource')
    || ' has been assigned more hours than remain after public holidays and leave.';

  IF uid IS NOT NULL AND uid IS DISTINCT FROM caller THEN
    INSERT INTO public.notifications (org_id, user_id, kind, title, body, link)
    VALUES (oid, uid, 'resource_over_allocation', title_txt, body_txt, link_txt);
    n := n + 1;
  END IF;

  IF mid IS NOT NULL AND mid IS DISTINCT FROM caller AND mid IS DISTINCT FROM uid THEN
    INSERT INTO public.notifications (org_id, user_id, kind, title, body, link)
    VALUES (oid, mid, 'resource_over_allocation', title_txt, body_txt, link_txt);
    n := n + 1;
  END IF;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_resource_over_allocation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_resource_over_allocation(uuid)
  TO authenticated, service_role;
