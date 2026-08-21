-- Optional top-down budget pots at Strategic Alignment and Program.
-- Project approved funding stays the project envelope; FY Allocation stays a
-- year slice of that project envelope. Child project sums vs this pot flag health.

CREATE TABLE IF NOT EXISTS public.hierarchy_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  layer text NOT NULL CHECK (layer IN ('alignment', 'program')),
  name text NOT NULL,
  envelope numeric(14,2),
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, layer, name)
);

COMMENT ON TABLE public.hierarchy_envelopes IS
  'Optional top-down budget envelope for a Strategic Alignment (projects.portfolio) or Program (projects.program). NULL envelope means unconstrained. Project budget is still the project envelope.';

COMMENT ON COLUMN public.hierarchy_envelopes.layer IS
  'alignment = Strategic Alignment (projects.portfolio); program = Program (projects.program).';

COMMENT ON COLUMN public.hierarchy_envelopes.envelope IS
  'Approved parent pot. NULL = not set (rollup only). Child project approved funding should stay inside this amount.';

CREATE INDEX IF NOT EXISTS hierarchy_envelopes_org_layer_idx
  ON public.hierarchy_envelopes (org_id, layer);

ALTER TABLE public.hierarchy_envelopes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hierarchy_envelopes TO authenticated;
GRANT ALL ON public.hierarchy_envelopes TO service_role;

DROP POLICY IF EXISTS "Members view hierarchy envelopes" ON public.hierarchy_envelopes;
CREATE POLICY "Members view hierarchy envelopes"
  ON public.hierarchy_envelopes FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "Members write hierarchy envelopes" ON public.hierarchy_envelopes;
CREATE POLICY "Members write hierarchy envelopes"
  ON public.hierarchy_envelopes FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

DROP TRIGGER IF EXISTS trg_hierarchy_envelopes_updated_at ON public.hierarchy_envelopes;
CREATE TRIGGER trg_hierarchy_envelopes_updated_at
  BEFORE UPDATE ON public.hierarchy_envelopes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
