-- Human RAID reference codes (RSK-001 / ISS-001 / ACT-001 / DEC-001 per project)
-- plus bidirectional project.sponsor ↔ stakeholders sync.
-- Idempotent. Does not rename existing columns.

-- =============================================================================
-- 1) RAID reference codes
-- =============================================================================
ALTER TABLE public.risks ADD COLUMN IF NOT EXISTS raid_code text;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS raid_code text;
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS raid_code text;
ALTER TABLE public.decisions ADD COLUMN IF NOT EXISTS raid_code text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_risks_project_raid_code
  ON public.risks (project_id, raid_code) WHERE raid_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_issues_project_raid_code
  ON public.issues (project_id, raid_code) WHERE raid_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_project_raid_code
  ON public.actions (project_id, raid_code) WHERE raid_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_decisions_project_raid_code
  ON public.decisions (project_id, raid_code) WHERE raid_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_assign_raid_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prefix text;
  n int;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.raid_code IS NULL OR btrim(NEW.raid_code) = '') AND OLD.raid_code IS NOT NULL THEN
      NEW.raid_code := OLD.raid_code;
    ELSIF NEW.raid_code IS NOT NULL THEN
      NEW.raid_code := upper(btrim(NEW.raid_code));
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.raid_code IS NOT NULL AND btrim(NEW.raid_code) <> '' THEN
    NEW.raid_code := upper(btrim(NEW.raid_code));
    RETURN NEW;
  END IF;

  prefix := CASE TG_TABLE_NAME
    WHEN 'risks' THEN 'RSK'
    WHEN 'issues' THEN 'ISS'
    WHEN 'actions' THEN 'ACT'
    WHEN 'decisions' THEN 'DEC'
    ELSE 'RAID'
  END;

  EXECUTE format(
    $f$
    SELECT COALESCE(MAX(NULLIF(regexp_replace(raid_code, %L, ''), '')::int), 0)
    FROM public.%I
    WHERE project_id = $1
      AND raid_code ~ %L
    $f$,
    '^' || prefix || '-0*',
    TG_TABLE_NAME,
    '^' || prefix || '-[0-9]+$'
  )
  INTO n
  USING NEW.project_id;

  NEW.raid_code := prefix || '-' || lpad((n + 1)::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_risks_raid_code ON public.risks;
CREATE TRIGGER trg_risks_raid_code
  BEFORE INSERT OR UPDATE ON public.risks
  FOR EACH ROW EXECUTE FUNCTION public.tg_assign_raid_code();

DROP TRIGGER IF EXISTS trg_issues_raid_code ON public.issues;
CREATE TRIGGER trg_issues_raid_code
  BEFORE INSERT OR UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.tg_assign_raid_code();

DROP TRIGGER IF EXISTS trg_actions_raid_code ON public.actions;
CREATE TRIGGER trg_actions_raid_code
  BEFORE INSERT OR UPDATE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_assign_raid_code();

DROP TRIGGER IF EXISTS trg_decisions_raid_code ON public.decisions;
CREATE TRIGGER trg_decisions_raid_code
  BEFORE INSERT OR UPDATE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION public.tg_assign_raid_code();

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n
  FROM public.risks
  WHERE raid_code IS NULL OR btrim(raid_code) = ''
)
UPDATE public.risks r
SET raid_code = 'RSK-' || lpad(n.n::text, 3, '0')
FROM numbered n
WHERE r.id = n.id;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n
  FROM public.issues
  WHERE raid_code IS NULL OR btrim(raid_code) = ''
)
UPDATE public.issues r
SET raid_code = 'ISS-' || lpad(n.n::text, 3, '0')
FROM numbered n
WHERE r.id = n.id;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n
  FROM public.actions
  WHERE raid_code IS NULL OR btrim(raid_code) = ''
)
UPDATE public.actions r
SET raid_code = 'ACT-' || lpad(n.n::text, 3, '0')
FROM numbered n
WHERE r.id = n.id;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY created_at, id) AS n
  FROM public.decisions
  WHERE raid_code IS NULL OR btrim(raid_code) = ''
)
UPDATE public.decisions r
SET raid_code = 'DEC-' || lpad(n.n::text, 3, '0')
FROM numbered n
WHERE r.id = n.id;

COMMENT ON COLUMN public.risks.raid_code IS 'Human Risk ID (RSK-001), unique per project. Not the database UUID.';
COMMENT ON COLUMN public.issues.raid_code IS 'Human Issue ID (ISS-001), unique per project.';
COMMENT ON COLUMN public.actions.raid_code IS 'Human Action ID (ACT-001), unique per project.';
COMMENT ON COLUMN public.decisions.raid_code IS 'Human Decision ID (DEC-001), unique per project.';

-- =============================================================================
-- 2) Project sponsor ↔ stakeholder (bidirectional)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.tg_sync_project_sponsor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_st_name text;
  v_id uuid;
  v_match uuid;
  v_match_name text;
BEGIN
  IF current_setting('iprojectx.syncing_sponsor', true) = '1' THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('iprojectx.syncing_sponsor', '1', true);

  -- Pointer changed: copy that stakeholder's name onto the project.
  IF TG_OP = 'UPDATE'
     AND NEW.sponsor_stakeholder_id IS DISTINCT FROM OLD.sponsor_stakeholder_id
     AND NEW.sponsor_stakeholder_id IS NOT NULL THEN
    SELECT name INTO v_st_name
    FROM public.stakeholders
    WHERE id = NEW.sponsor_stakeholder_id
      AND project_id = NEW.id;
    IF v_st_name IS NOT NULL THEN
      UPDATE public.projects
      SET sponsor = v_st_name
      WHERE id = NEW.id AND sponsor IS DISTINCT FROM v_st_name;
      UPDATE public.stakeholders
      SET is_sponsor = true
      WHERE id = NEW.sponsor_stakeholder_id AND is_sponsor IS NOT TRUE;
    END IF;
    PERFORM set_config('iprojectx.syncing_sponsor', '0', true);
    RETURN NEW;
  END IF;

  v_name := nullif(btrim(COALESCE(NEW.sponsor, '')), '');

  IF TG_OP = 'UPDATE'
     AND NEW.sponsor IS NOT DISTINCT FROM OLD.sponsor
     AND NEW.sponsor_stakeholder_id IS NOT DISTINCT FROM OLD.sponsor_stakeholder_id THEN
    PERFORM set_config('iprojectx.syncing_sponsor', '0', true);
    RETURN NEW;
  END IF;

  IF v_name IS NULL THEN
    IF NEW.sponsor_stakeholder_id IS NOT NULL THEN
      UPDATE public.projects SET sponsor_stakeholder_id = NULL WHERE id = NEW.id;
    END IF;
    PERFORM set_config('iprojectx.syncing_sponsor', '0', true);
    RETURN NEW;
  END IF;

  SELECT id, name INTO v_match, v_match_name
  FROM public.stakeholders
  WHERE project_id = NEW.id
    AND lower(btrim(name)) = lower(v_name)
  ORDER BY CASE WHEN id = NEW.sponsor_stakeholder_id THEN 0 ELSE 1 END,
           is_sponsor DESC,
           created_at ASC
  LIMIT 1;

  IF v_match IS NOT NULL THEN
    UPDATE public.stakeholders
    SET is_sponsor = true
    WHERE id = v_match AND is_sponsor IS NOT TRUE;
    IF NEW.sponsor_stakeholder_id IS DISTINCT FROM v_match THEN
      UPDATE public.projects
      SET sponsor_stakeholder_id = v_match
      WHERE id = NEW.id;
    END IF;
    IF NEW.sponsor IS DISTINCT FROM v_match_name THEN
      UPDATE public.projects SET sponsor = v_match_name WHERE id = NEW.id;
    END IF;
    PERFORM set_config('iprojectx.syncing_sponsor', '0', true);
    RETURN NEW;
  END IF;

  -- Same primary person, renamed on the project sheet.
  IF NEW.sponsor_stakeholder_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.sponsor_stakeholder_id IS NOT DISTINCT FROM OLD.sponsor_stakeholder_id) THEN
    UPDATE public.stakeholders
    SET name = v_name, is_sponsor = true
    WHERE id = NEW.sponsor_stakeholder_id
      AND project_id = NEW.id;
    PERFORM set_config('iprojectx.syncing_sponsor', '0', true);
    RETURN NEW;
  END IF;

  INSERT INTO public.stakeholders (org_id, project_id, name, role, is_sponsor)
  VALUES (NEW.org_id, NEW.id, v_name, 'Executive Sponsor', true)
  RETURNING id INTO v_id;

  UPDATE public.projects
  SET sponsor_stakeholder_id = v_id
  WHERE id = NEW.id AND sponsor_stakeholder_id IS DISTINCT FROM v_id;

  PERFORM set_config('iprojectx.syncing_sponsor', '0', true);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_sync_stakeholder_sponsor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary uuid;
  v_other_id uuid;
  v_other_name text;
  v_project uuid;
BEGIN
  IF current_setting('iprojectx.syncing_sponsor', true) = '1' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  PERFORM set_config('iprojectx.syncing_sponsor', '1', true);

  IF TG_OP = 'DELETE' THEN
    v_project := OLD.project_id;
    SELECT sponsor_stakeholder_id INTO v_primary FROM public.projects WHERE id = v_project;
    IF v_primary = OLD.id THEN
      SELECT id, name INTO v_other_id, v_other_name
      FROM public.stakeholders
      WHERE project_id = v_project AND id <> OLD.id AND is_sponsor IS TRUE
      ORDER BY created_at ASC
      LIMIT 1;
      UPDATE public.projects
      SET sponsor_stakeholder_id = v_other_id,
          sponsor = v_other_name
      WHERE id = v_project;
    END IF;
    PERFORM set_config('iprojectx.syncing_sponsor', '0', true);
    RETURN OLD;
  END IF;

  SELECT sponsor_stakeholder_id INTO v_primary FROM public.projects WHERE id = NEW.project_id;

  IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name AND v_primary = NEW.id THEN
    UPDATE public.projects
    SET sponsor = NEW.name
    WHERE id = NEW.project_id AND sponsor IS DISTINCT FROM NEW.name;
  END IF;

  IF NEW.is_sponsor IS TRUE AND (TG_OP = 'INSERT' OR OLD.is_sponsor IS NOT TRUE) THEN
    IF v_primary IS NULL THEN
      UPDATE public.projects
      SET sponsor_stakeholder_id = NEW.id,
          sponsor = NEW.name
      WHERE id = NEW.project_id;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_sponsor IS TRUE AND NEW.is_sponsor IS NOT TRUE AND v_primary = NEW.id THEN
    SELECT id, name INTO v_other_id, v_other_name
    FROM public.stakeholders
    WHERE project_id = NEW.project_id AND id <> NEW.id AND is_sponsor IS TRUE
    ORDER BY created_at ASC
    LIMIT 1;
    UPDATE public.projects
    SET sponsor_stakeholder_id = v_other_id,
        sponsor = v_other_name
    WHERE id = NEW.project_id;
  END IF;

  PERFORM set_config('iprojectx.syncing_sponsor', '0', true);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_sync_sponsor ON public.projects;
CREATE TRIGGER trg_projects_sync_sponsor
  AFTER INSERT OR UPDATE OF sponsor, sponsor_stakeholder_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_project_sponsor();

DROP TRIGGER IF EXISTS trg_stakeholders_sync_sponsor ON public.stakeholders;
CREATE TRIGGER trg_stakeholders_sync_sponsor
  AFTER INSERT OR UPDATE OF name, is_sponsor, project_id ON public.stakeholders
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_stakeholder_sponsor();

DROP TRIGGER IF EXISTS trg_stakeholders_sync_sponsor_del ON public.stakeholders;
CREATE TRIGGER trg_stakeholders_sync_sponsor_del
  BEFORE DELETE ON public.stakeholders
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_stakeholder_sponsor();

-- Backfill: project sponsor text → stakeholder + primary link (fires OF sponsor)
UPDATE public.projects
SET sponsor = btrim(sponsor)
WHERE nullif(btrim(COALESCE(sponsor, '')), '') IS NOT NULL;
