-- Delivery methods (org-configurable) + stage gate templates per method.
-- Enables Waterfall / Agile / Hybrid defaults and custom methods created by org admins.
-- Safe / additive / mostly idempotent.

-- =============================================================================
-- 1) delivery_methods
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.delivery_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  uses_stage_gates boolean NOT NULL DEFAULT true,
  uses_sprints boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code),
  UNIQUE (org_id, name),
  CONSTRAINT delivery_methods_code_format CHECK (code ~ '^[a-z0-9][a-z0-9_-]{0,62}$')
);

CREATE INDEX IF NOT EXISTS idx_delivery_methods_org
  ON public.delivery_methods (org_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_methods TO authenticated;
GRANT ALL ON public.delivery_methods TO service_role;

ALTER TABLE public.delivery_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view org delivery methods" ON public.delivery_methods;
CREATE POLICY "Members view org delivery methods"
  ON public.delivery_methods FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "Admins manage org delivery methods" ON public.delivery_methods;
CREATE POLICY "Admins manage org delivery methods"
  ON public.delivery_methods FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_delivery_methods_updated_at ON public.delivery_methods;
CREATE TRIGGER trg_delivery_methods_updated_at
  BEFORE UPDATE ON public.delivery_methods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =============================================================================
-- 2) Link stage_gate_definitions → delivery_methods
-- =============================================================================
ALTER TABLE public.stage_gate_definitions
  ADD COLUMN IF NOT EXISTS delivery_method_id uuid
    REFERENCES public.delivery_methods(id) ON DELETE CASCADE;

-- Seed built-in methods for every org
INSERT INTO public.delivery_methods (
  org_id, code, name, description, uses_stage_gates, uses_sprints, is_system, sort_order
)
SELECT o.id, v.code, v.name, v.description, v.uses_stage_gates, v.uses_sprints, true, v.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  ('waterfall', 'Waterfall', 'Sequential stage-gate delivery', true,  false, 1),
  ('agile',     'Agile',     'Iterative delivery with sprints', false, true,  2),
  ('hybrid',    'Hybrid',    'Stage gates plus sprints',        true,  true,  3)
) AS v(code, name, description, uses_stage_gates, uses_sprints, sort_order)
ON CONFLICT (org_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  uses_stage_gates = EXCLUDED.uses_stage_gates,
  uses_sprints = EXCLUDED.uses_sprints,
  is_system = true,
  is_active = true,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Attach existing org-global gate defs to Waterfall (legacy behaviour)
UPDATE public.stage_gate_definitions d
SET delivery_method_id = m.id
FROM public.delivery_methods m
WHERE m.org_id = d.org_id
  AND m.code = 'waterfall'
  AND d.delivery_method_id IS NULL;

-- Widen uniqueness: same gate name can exist on different methods
ALTER TABLE public.stage_gate_definitions
  DROP CONSTRAINT IF EXISTS stage_gate_definitions_org_id_gate_name_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stage_gate_definitions_org_method_gate_key'
  ) THEN
    ALTER TABLE public.stage_gate_definitions
      ADD CONSTRAINT stage_gate_definitions_org_method_gate_key
      UNIQUE (org_id, delivery_method_id, gate_name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stage_gate_definitions_method
  ON public.stage_gate_definitions (org_id, delivery_method_id, sort_order);

-- =============================================================================
-- 3) Default gate templates per built-in method (only when method has zero defs)
-- =============================================================================
-- Waterfall: keep whatever already exists; if still empty, seed canonical 9
INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order, is_active)
SELECT m.org_id, m.id, g.name, g.ord, true
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
WHERE m.code = 'waterfall'
  AND NOT EXISTS (
    SELECT 1 FROM public.stage_gate_definitions d
    WHERE d.delivery_method_id = m.id
  );

-- Agile: lighter release-oriented gates (optional on Agile projects)
INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order, is_active)
SELECT m.org_id, m.id, g.name, g.ord, true
FROM public.delivery_methods m
CROSS JOIN (VALUES
  ('Discovery', 1),
  ('MVP Definition', 2),
  ('Build / Iterate', 3),
  ('Release Readiness', 4),
  ('Launch', 5),
  ('Hypercare', 6)
) AS g(name, ord)
WHERE m.code = 'agile'
  AND NOT EXISTS (
    SELECT 1 FROM public.stage_gate_definitions d
    WHERE d.delivery_method_id = m.id
  );

-- Hybrid: same as Waterfall by default (gates + sprints both enabled on method)
INSERT INTO public.stage_gate_definitions (org_id, delivery_method_id, gate_name, sort_order, is_active)
SELECT m.org_id, m.id, g.name, g.ord, true
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
WHERE m.code = 'hybrid'
  AND NOT EXISTS (
    SELECT 1 FROM public.stage_gate_definitions d
    WHERE d.delivery_method_id = m.id
  );

-- =============================================================================
-- 4) projects.delivery_method: enum → text so custom method names can be stored
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects'
      AND column_name = 'delivery_method' AND udt_name = 'delivery_method'
  ) THEN
    ALTER TABLE public.projects
      ALTER COLUMN delivery_method DROP DEFAULT;
    ALTER TABLE public.projects
      ALTER COLUMN delivery_method TYPE text USING delivery_method::text;
    ALTER TABLE public.projects
      ALTER COLUMN delivery_method SET DEFAULT 'Waterfall';
  END IF;
END $$;

-- Optional FK-ish helper column (nullable); name remains source of truth for UI
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS delivery_method_id uuid
    REFERENCES public.delivery_methods(id) ON DELETE SET NULL;

UPDATE public.projects p
SET delivery_method_id = m.id
FROM public.delivery_methods m
WHERE m.org_id = p.org_id
  AND lower(m.name) = lower(coalesce(p.delivery_method, 'Waterfall'))
  AND p.delivery_method_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_delivery_method_id
  ON public.projects (delivery_method_id);

-- =============================================================================
-- 5) ensure_org_delivery_methods — call from UI / triggers for new orgs
-- =============================================================================
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

GRANT EXECUTE ON FUNCTION public.ensure_org_delivery_methods(uuid) TO authenticated;

-- Auto-seed when a new organisation is created
CREATE OR REPLACE FUNCTION public.tg_org_ensure_delivery_methods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_org_delivery_methods(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_ensure_delivery_methods ON public.organizations;
CREATE TRIGGER trg_org_ensure_delivery_methods
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_org_ensure_delivery_methods();

COMMENT ON TABLE public.delivery_methods IS
  'Org delivery models (Waterfall/Agile/Hybrid + custom). Controls gates vs sprints and gate templates.';
COMMENT ON COLUMN public.stage_gate_definitions.delivery_method_id IS
  'Stage-gate template set for a delivery method. Null only for legacy rows mid-migration.';
