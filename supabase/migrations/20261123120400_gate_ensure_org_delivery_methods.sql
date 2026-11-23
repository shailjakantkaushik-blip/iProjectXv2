-- T5: ensure_org_delivery_methods is SECURITY DEFINER and granted to
-- authenticated with no caller check. The browser still calls it, so keep
-- GRANT authenticated. Signed-in callers must match get_user_org() or be
-- platform_admin (org-create). auth.uid() IS NULL allows the org trigger.

CREATE OR REPLACE FUNCTION public.ensure_org_delivery_methods(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NOT NULL
     AND public.get_user_org(auth.uid()) IS DISTINCT FROM p_org_id
     AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.delivery_methods (
    org_id, code, name, description, uses_stage_gates, uses_sprints, is_system, sort_order
  )
  VALUES
    (p_org_id, 'waterfall', 'Waterfall', 'Sequential stage-gate delivery', true,  false, true, 1),
    (p_org_id, 'agile',     'Agile',     'Iterative delivery with sprints', false, true,  true, 2),
    (p_org_id, 'hybrid',    'Hybrid',    'Stage gates plus sprints',        true,  true,  true, 3)
  ON CONFLICT (org_id, code) DO NOTHING;

  -- Waterfall gates
  INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order)
  SELECT p_org_id, m.id, g.name, g.ord
  FROM public.delivery_methods m
  CROSS JOIN (VALUES
    ('Discovery', 1),
    ('Business Case / Seed Funding', 2),
    ('Design', 3),
    ('Business Case / Full Funding', 4),
    ('Build', 5),
    ('Testing', 6),
    ('Deployment', 7),
    ('Handover', 8),
    ('Benefit Realisation', 9)
  ) AS g(name, ord)
  WHERE m.org_id = p_org_id AND m.code = 'waterfall'
    AND NOT EXISTS (SELECT 1 FROM public.stage_gate_definitions d WHERE d.delivery_method_id = m.id);

  -- Agile gates
  INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order)
  SELECT p_org_id, m.id, g.name, g.ord
  FROM public.delivery_methods m
  CROSS JOIN (VALUES
    ('Discovery', 1),
    ('MVP Definition', 2),
    ('Build / Iterate', 3),
    ('Release Readiness', 4),
    ('Launch', 5),
    ('Hypercare', 6)
  ) AS g(name, ord)
  WHERE m.org_id = p_org_id AND m.code = 'agile'
    AND NOT EXISTS (SELECT 1 FROM public.stage_gate_definitions d WHERE d.delivery_method_id = m.id);

  -- Hybrid gates
  INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order)
  SELECT p_org_id, m.id, g.name, g.ord
  FROM public.delivery_methods m
  CROSS JOIN (VALUES
    ('Discovery', 1),
    ('Business Case / Seed Funding', 2),
    ('Design', 3),
    ('Business Case / Full Funding', 4),
    ('Build', 5),
    ('Testing', 6),
    ('Deployment', 7),
    ('Handover', 8),
    ('Benefit Realisation', 9)
  ) AS g(name, ord)
  WHERE m.org_id = p_org_id AND m.code = 'hybrid'
    AND NOT EXISTS (SELECT 1 FROM public.stage_gate_definitions d WHERE d.delivery_method_id = m.id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_org_delivery_methods(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_org_delivery_methods(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_org_delivery_methods(uuid) TO authenticated, service_role;
