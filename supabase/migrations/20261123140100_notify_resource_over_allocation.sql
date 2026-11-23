-- Notify the resource's linked login and resource manager when a planner
-- confirms an assignment that exceeds leave/holiday-adjusted hours.

CREATE OR REPLACE FUNCTION public.notify_resource_over_allocation(
  _resource_id uuid,
  _title text,
  _body text,
  _link text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  oid uuid;
  uid uuid;
  mid uuid;
  n integer := 0;
  caller uuid := auth.uid();
BEGIN
  oid := public.get_user_org(caller);
  IF oid IS NULL THEN
    RAISE EXCEPTION 'not in an organisation';
  END IF;

  SELECT r.user_id, r.manager_user_id
    INTO uid, mid
  FROM public.resources r
  WHERE r.id = _resource_id AND r.org_id = oid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'resource not found';
  END IF;

  IF uid IS NOT NULL AND uid IS DISTINCT FROM caller THEN
    INSERT INTO public.notifications (org_id, user_id, kind, title, body, link)
    VALUES (oid, uid, 'resource_over_allocation', _title, _body, coalesce(_link, '/app/resources?tab=calendars'));
    n := n + 1;
  END IF;

  IF mid IS NOT NULL AND mid IS DISTINCT FROM caller AND mid IS DISTINCT FROM uid THEN
    INSERT INTO public.notifications (org_id, user_id, kind, title, body, link)
    VALUES (oid, mid, 'resource_over_allocation', _title, _body, coalesce(_link, '/app/resources?tab=calendars'));
    n := n + 1;
  END IF;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_resource_over_allocation(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_resource_over_allocation(uuid, text, text, text)
  TO authenticated, service_role;
