-- Program envelopes are children of a Strategic Alignment (not a global program name).
-- parent_name is empty for alignment rows; for program rows it is projects.portfolio.

ALTER TABLE public.hierarchy_envelopes
  ADD COLUMN IF NOT EXISTS parent_name text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.hierarchy_envelopes.parent_name IS
  'Strategic Alignment name for program rows (projects.portfolio). Empty string for alignment rows.';

-- Attach existing program pots to the most common SA that uses that program label.
UPDATE public.hierarchy_envelopes he
SET parent_name = COALESCE((
  SELECT mode() WITHIN GROUP (
    ORDER BY COALESCE(NULLIF(btrim(p.portfolio), ''), 'Unassigned')
  )
  FROM public.projects p
  WHERE p.org_id = he.org_id
    AND COALESCE(NULLIF(btrim(p.program), ''), 'Unassigned') = he.name
), 'Unassigned')
WHERE he.layer = 'program'
  AND he.parent_name = '';

ALTER TABLE public.hierarchy_envelopes
  DROP CONSTRAINT IF EXISTS hierarchy_envelopes_org_id_layer_name_key;

ALTER TABLE public.hierarchy_envelopes
  DROP CONSTRAINT IF EXISTS hierarchy_envelopes_org_layer_parent_name_key;

ALTER TABLE public.hierarchy_envelopes
  ADD CONSTRAINT hierarchy_envelopes_org_layer_parent_name_key
  UNIQUE (org_id, layer, parent_name, name);

DROP INDEX IF EXISTS public.hierarchy_envelopes_org_layer_idx;
CREATE INDEX IF NOT EXISTS hierarchy_envelopes_org_layer_parent_idx
  ON public.hierarchy_envelopes (org_id, layer, parent_name);
