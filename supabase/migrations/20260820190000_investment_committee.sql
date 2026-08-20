-- Investment Committee pack: org-wide forum template + page ACL.
-- The page itself is a live read of demand / gates / finance / decisions.

INSERT INTO public.governance_forum_templates (
  org_id, name, cadence, scope_level, purpose, audience, sort_order
)
SELECT
  o.id,
  'Investment Committee',
  'Quarterly',
  'strategic_alignment',
  'Approve capital asks, seed / full funding gates, and investment ranking.',
  'Sponsors & CFO',
  20
FROM public.organizations o
ON CONFLICT (org_id, scope_level, name) DO NOTHING;

INSERT INTO public.role_table_permissions (org_id, role, table_name, can_view, can_edit)
SELECT DISTINCT ON (src.org_id, src.role)
  src.org_id,
  src.role,
  'page::/app/investment-committee',
  src.can_view,
  src.can_edit
FROM public.role_table_permissions src
WHERE src.table_name IN (
  'page::/app/governance-channels',
  'page::/app/executive-cockpit',
  'page::/app/decisions',
  'page::/app/projects'
)
  AND NOT EXISTS (
    SELECT 1
    FROM public.role_table_permissions x
    WHERE x.org_id = src.org_id
      AND x.role = src.role
      AND x.table_name = 'page::/app/investment-committee'
  )
ORDER BY
  src.org_id,
  src.role,
  CASE src.table_name
    WHEN 'page::/app/governance-channels' THEN 0
    WHEN 'page::/app/executive-cockpit' THEN 1
    WHEN 'page::/app/decisions' THEN 2
    ELSE 3
  END;

CREATE OR REPLACE FUNCTION public.seed_default_page_permissions(_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  paths text[] := ARRAY[
    '/app','/app/projects','/app/portfolio-pulse','/app/executive-cockpit',
    '/app/strategic-alignment',
    '/app/risks','/app/issues','/app/actions','/app/decisions',
    '/app/timeline','/app/work-items','/app/work-board','/app/my-work',
    '/app/resources','/app/stakeholders','/app/status-updates','/app/lessons',
    '/app/benefits','/app/dependencies','/app/change-requests','/app/stage-gates',
    '/app/governance-channels','/app/investment-committee',
    '/app/settings','/app/support'
  ];
  role_key text;
  p text;
BEGIN
  FOREACH role_key IN ARRAY ARRAY['pm','bu_lead','executive'] LOOP
    FOREACH p IN ARRAY paths LOOP
      INSERT INTO public.role_table_permissions (org_id, role, table_name, can_view, can_edit)
      SELECT _org_id, role_key, 'page::' || p, true, role_key IN ('pm','bu_lead')
      WHERE NOT EXISTS (
        SELECT 1 FROM public.role_table_permissions x
        WHERE x.org_id = _org_id AND x.role = role_key AND x.table_name = 'page::' || p
      );
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_page_permissions(uuid) TO authenticated, service_role;
