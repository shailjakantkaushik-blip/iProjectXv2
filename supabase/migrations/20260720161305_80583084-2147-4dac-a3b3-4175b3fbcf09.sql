
-- Stage gate definitions per organisation (configurable)
CREATE TABLE public.stage_gate_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  gate_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, gate_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_gate_definitions TO authenticated;
GRANT ALL ON public.stage_gate_definitions TO service_role;

ALTER TABLE public.stage_gate_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view org stage gate defs"
  ON public.stage_gate_definitions FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "Admins manage org stage gate defs"
  ON public.stage_gate_definitions FOR ALL
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

CREATE TRIGGER trg_stage_gate_definitions_updated_at
  BEFORE UPDATE ON public.stage_gate_definitions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed default gates for every existing organisation
INSERT INTO public.stage_gate_definitions (org_id, gate_name, sort_order)
SELECT o.id, g.name, g.ord
FROM public.organizations o
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
ON CONFLICT (org_id, gate_name) DO NOTHING;

-- Backfill stage_gates rows for projects that have none yet, spread evenly across project window
INSERT INTO public.stage_gates (org_id, project_id, gate_name, planned_date, status)
SELECT
  p.org_id,
  p.id,
  d.gate_name,
  (COALESCE(p.start_date, CURRENT_DATE)
    + ((COALESCE(p.end_date, p.start_date + INTERVAL '180 days')::date
        - COALESCE(p.start_date, CURRENT_DATE)::date)
       * (d.sort_order - 1) / 8))::date AS planned_date,
  'Pending'
FROM public.projects p
JOIN public.stage_gate_definitions d ON d.org_id = p.org_id AND d.is_active = true
WHERE NOT EXISTS (
  SELECT 1 FROM public.stage_gates sg
  WHERE sg.project_id = p.id AND sg.gate_name = d.gate_name
);
