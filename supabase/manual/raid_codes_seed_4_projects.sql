-- RAID human IDs (RSK / ISS / ACT / DEC) + replacement RAID for the four
-- iProjectX e2e projects (PRJ-001 … PRJ-004).
--
-- Paste in Supabase → SQL Editor (or psql). Idempotent.
-- Org slug: iprojectx
--
-- After this runs, SELECT at the bottom lists uuid + raid_code for every row.

BEGIN;

-- =============================================================================
-- A) Schema: raid_code column, unique per project, auto-assign on insert
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

COMMENT ON COLUMN public.risks.raid_code IS 'Human Risk ID (RSK-001), unique per project. Not the database UUID.';
COMMENT ON COLUMN public.issues.raid_code IS 'Human Issue ID (ISS-001), unique per project.';
COMMENT ON COLUMN public.actions.raid_code IS 'Human Action ID (ACT-001), unique per project.';
COMMENT ON COLUMN public.decisions.raid_code IS 'Human Decision ID (DEC-001), unique per project.';

-- =============================================================================
-- B) Replace RAID on PRJ-001 … PRJ-004 with explicit IDs
--
-- Stable UUIDs (hex): e2e0000{n}-a00{k}-4000-8000-00000000000{seq}
--   n = project 1–4
--   k = 1 risk, 2 issue, 3 action, 4 decision
--
-- Catalogue (human IDs are unique per project, so each project has RSK-001…):
--
-- PRJ-001 Customer Portal Redesign
--   RSK-001 e2e00001-a001-4000-8000-000000000001  UX contractor contention
--   RSK-002 e2e00001-a001-4000-8000-000000000002  CMS vendor API freeze
--   RSK-003 e2e00001-a001-4000-8000-000000000003  Experience journey scope
--   ISS-001 e2e00001-a002-4000-8000-000000000001  IdP preview access
--   ISS-002 e2e00001-a002-4000-8000-000000000002  Design token mismatch
--   ACT-001 e2e00001-a003-4000-8000-000000000001  Confirm FY Experience drawdown
--   ACT-002 e2e00001-a003-4000-8000-000000000002  Core + Experience RAID workshop
--   ACT-003 e2e00001-a003-4000-8000-000000000003  Publish portal steering pack
--   ACT-004 e2e00001-a003-4000-8000-000000000004  Close last steering actions
--   DEC-001 e2e00001-a004-4000-8000-000000000001  Adopt Core + Experience streams
--   DEC-002 e2e00001-a004-4000-8000-000000000002  Confirm Hybrid delivery
--
-- PRJ-002 Core Banking API Platform
--   RSK-001 e2e00002-a001-4000-8000-000000000001  Integration specialist capacity
--   RSK-002 e2e00002-a001-4000-8000-000000000002  Core release-train slip
--   RSK-003 e2e00002-a001-4000-8000-000000000003  Unscoped platform adapters
--   ISS-001 e2e00002-a002-4000-8000-000000000001  Core sandbox access
--   ISS-002 e2e00002-a002-4000-8000-000000000002  Vendor security questionnaire
--   ACT-001 e2e00002-a003-4000-8000-000000000001  Confirm FY API drawdown
--   ACT-002 e2e00002-a003-4000-8000-000000000002  Core + Platform RAID review
--   ACT-003 e2e00002-a003-4000-8000-000000000003  Publish program board pack
--   ACT-004 e2e00002-a003-4000-8000-000000000004  Close last steering actions
--   DEC-001 e2e00002-a004-4000-8000-000000000001  Adopt Core + Platform streams
--   DEC-002 e2e00002-a004-4000-8000-000000000002  Confirm Agile delivery
--
-- PRJ-003 Data Lakehouse Foundation
--   RSK-001 e2e00003-a001-4000-8000-000000000001  Data engineering capacity
--   RSK-002 e2e00003-a001-4000-8000-000000000002  Extract dependency on core APIs
--   RSK-003 e2e00003-a001-4000-8000-000000000003  Catalog scope expansion
--   ISS-001 e2e00003-a002-4000-8000-000000000001  Landing-zone delay
--   ISS-002 e2e00003-a002-4000-8000-000000000002  Catalog vendor questionnaire
--   ACT-001 e2e00003-a003-4000-8000-000000000001  Confirm FY lakehouse drawdown
--   ACT-002 e2e00003-a003-4000-8000-000000000002  Core + Data RAID workshop
--   ACT-003 e2e00003-a003-4000-8000-000000000003  Publish data steering pack
--   ACT-004 e2e00003-a003-4000-8000-000000000004  Close last steering actions
--   DEC-001 e2e00003-a004-4000-8000-000000000001  Adopt Core + Data streams
--   DEC-002 e2e00003-a004-4000-8000-000000000002  Confirm Waterfall delivery
--
-- PRJ-004 Cyber Resilience Uplift
--   RSK-001 e2e00004-a001-4000-8000-000000000001  Shared security architects
--   RSK-002 e2e00004-a001-4000-8000-000000000002  Identity platform dependency
--   RSK-003 e2e00004-a001-4000-8000-000000000003  Control-set expansion
--   ISS-001 e2e00004-a002-4000-8000-000000000001  Pentest environment pending
--   ISS-002 e2e00004-a002-4000-8000-000000000002  MSSP questionnaire lag
--   ACT-001 e2e00004-a003-4000-8000-000000000001  Confirm FY cyber drawdown
--   ACT-002 e2e00004-a003-4000-8000-000000000002  Core + Security RAID workshop
--   ACT-003 e2e00004-a003-4000-8000-000000000003  Publish CISO steering pack
--   ACT-004 e2e00004-a003-4000-8000-000000000004  Close last steering actions
--   DEC-001 e2e00004-a004-4000-8000-000000000001  Adopt Core + Security streams
--   DEC-002 e2e00004-a004-4000-8000-000000000002  Confirm Hybrid delivery
-- =============================================================================

DO $$
DECLARE
  v_org uuid;
  r RECORD;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'iprojectx' LIMIT 1;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organization slug iprojectx not found';
  END IF;

  -- Drop existing RAID for the four seed projects (re-insert below with IDs).
  DELETE FROM public.actions a
  USING public.projects p
  WHERE a.project_id = p.id AND p.org_id = v_org
    AND p.project_code IN ('PRJ-001', 'PRJ-002', 'PRJ-003', 'PRJ-004');
  DELETE FROM public.decisions d
  USING public.projects p
  WHERE d.project_id = p.id AND p.org_id = v_org
    AND p.project_code IN ('PRJ-001', 'PRJ-002', 'PRJ-003', 'PRJ-004');
  DELETE FROM public.issues i
  USING public.projects p
  WHERE i.project_id = p.id AND p.org_id = v_org
    AND p.project_code IN ('PRJ-001', 'PRJ-002', 'PRJ-003', 'PRJ-004');
  DELETE FROM public.risks rsk
  USING public.projects p
  WHERE rsk.project_id = p.id AND p.org_id = v_org
    AND p.project_code IN ('PRJ-001', 'PRJ-002', 'PRJ-003', 'PRJ-004');

  -- Also remove any leftover rows that already use these stable UUIDs.
  DELETE FROM public.risks WHERE id IN (
    'e2e00001-a001-4000-8000-000000000001', 'e2e00001-a001-4000-8000-000000000002', 'e2e00001-a001-4000-8000-000000000003',
    'e2e00002-a001-4000-8000-000000000001', 'e2e00002-a001-4000-8000-000000000002', 'e2e00002-a001-4000-8000-000000000003',
    'e2e00003-a001-4000-8000-000000000001', 'e2e00003-a001-4000-8000-000000000002', 'e2e00003-a001-4000-8000-000000000003',
    'e2e00004-a001-4000-8000-000000000001', 'e2e00004-a001-4000-8000-000000000002', 'e2e00004-a001-4000-8000-000000000003'
  );
  DELETE FROM public.issues WHERE id IN (
    'e2e00001-a002-4000-8000-000000000001', 'e2e00001-a002-4000-8000-000000000002',
    'e2e00002-a002-4000-8000-000000000001', 'e2e00002-a002-4000-8000-000000000002',
    'e2e00003-a002-4000-8000-000000000001', 'e2e00003-a002-4000-8000-000000000002',
    'e2e00004-a002-4000-8000-000000000001', 'e2e00004-a002-4000-8000-000000000002'
  );
  DELETE FROM public.actions WHERE id IN (
    'e2e00001-a003-4000-8000-000000000001', 'e2e00001-a003-4000-8000-000000000002',
    'e2e00001-a003-4000-8000-000000000003', 'e2e00001-a003-4000-8000-000000000004',
    'e2e00002-a003-4000-8000-000000000001', 'e2e00002-a003-4000-8000-000000000002',
    'e2e00002-a003-4000-8000-000000000003', 'e2e00002-a003-4000-8000-000000000004',
    'e2e00003-a003-4000-8000-000000000001', 'e2e00003-a003-4000-8000-000000000002',
    'e2e00003-a003-4000-8000-000000000003', 'e2e00003-a003-4000-8000-000000000004',
    'e2e00004-a003-4000-8000-000000000001', 'e2e00004-a003-4000-8000-000000000002',
    'e2e00004-a003-4000-8000-000000000003', 'e2e00004-a003-4000-8000-000000000004'
  );
  DELETE FROM public.decisions WHERE id IN (
    'e2e00001-a004-4000-8000-000000000001', 'e2e00001-a004-4000-8000-000000000002',
    'e2e00002-a004-4000-8000-000000000001', 'e2e00002-a004-4000-8000-000000000002',
    'e2e00003-a004-4000-8000-000000000001', 'e2e00003-a004-4000-8000-000000000002',
    'e2e00004-a004-4000-8000-000000000001', 'e2e00004-a004-4000-8000-000000000002'
  );

  FOR r IN
    SELECT p.id, p.project_code, p.name, p.sponsor, p.delivery_method,
           (SELECT ps.id FROM public.project_streams ps WHERE ps.project_id = p.id AND ps.is_default LIMIT 1) AS core_id
    FROM public.projects p
    WHERE p.org_id = v_org AND p.project_code IN ('PRJ-001', 'PRJ-002', 'PRJ-003', 'PRJ-004')
    ORDER BY p.project_code
  LOOP
    IF r.project_code = 'PRJ-001' THEN
      INSERT INTO public.risks (
        id, org_id, project_id, raid_code, title, description, category,
        probability, impact, severity, status, owner, mitigation, due_date
      ) VALUES
        ('e2e00001-a001-4000-8000-000000000001', v_org, r.id, 'RSK-001',
         'UX contractor contention', 'Key experience contractors are shared with other P1s',
         'Resource', 3, 4, 12, 'Open', r.sponsor, 'Prioritise portal critical path; surge contractors', CURRENT_DATE + 30),
        ('e2e00001-a001-4000-8000-000000000002', v_org, r.id, 'RSK-002',
         'CMS vendor API freeze', 'CMS freeze window may slip the Experience stream',
         'Dependency', 4, 3, 12, 'Open', r.sponsor, 'Weekly vendor forum; contingency design', CURRENT_DATE + 21),
        ('e2e00001-a001-4000-8000-000000000003', v_org, r.id, 'RSK-003',
         'Experience journey scope', 'Secondary stream journeys expanding beyond agreed MVP',
         'Scope', 2, 3, 6, 'Mitigating', r.sponsor, 'Change board; freeze after Design', CURRENT_DATE + 45);

      INSERT INTO public.issues (
        id, org_id, project_id, raid_code, title, description, priority, status, owner, raised_date, target_date
      ) VALUES
        ('e2e00001-a002-4000-8000-000000000001', v_org, r.id, 'ISS-001',
         'IdP preview access', 'Non-prod identity not wired for portal preview',
         'Medium', 'Open', r.sponsor, CURRENT_DATE - 7, CURRENT_DATE + 14),
        ('e2e00001-a002-4000-8000-000000000002', v_org, r.id, 'ISS-002',
         'Design token mismatch', 'Portal tokens diverge from the brand system',
         'High', 'Open', r.sponsor, CURRENT_DATE - 3, CURRENT_DATE + 10);

      INSERT INTO public.actions (
        id, org_id, project_id, raid_code, title, description, owner, due_date, status, priority, completed_date
      ) VALUES
        ('e2e00001-a003-4000-8000-000000000001', v_org, r.id, 'ACT-001',
         'Confirm FY Experience drawdown', 'Validate drawdown against FY allocations',
         r.sponsor, CURRENT_DATE + 14, 'Open', 'Medium', NULL),
        ('e2e00001-a003-4000-8000-000000000002', v_org, r.id, 'ACT-002',
         'Core + Experience RAID workshop', 'Joint RAID review across both streams',
         r.sponsor, CURRENT_DATE + 7, 'Open', 'High', NULL),
        ('e2e00001-a003-4000-8000-000000000003', v_org, r.id, 'ACT-003',
         'Publish portal steering pack', 'Monthly status for steering',
         r.sponsor, CURRENT_DATE + 3, 'In Progress', 'Medium', NULL),
        ('e2e00001-a003-4000-8000-000000000004', v_org, r.id, 'ACT-004',
         'Close last steering actions', 'Actions agreed at last steering are complete',
         r.sponsor, CURRENT_DATE - 2, 'Done', 'Medium', CURRENT_DATE - 3);

      INSERT INTO public.decisions (
        id, org_id, project_id, raid_code, stage_gate_id, title, description,
        decision_date, decided_by, rationale, impact, status
      ) VALUES
        ('e2e00001-a004-4000-8000-000000000001', v_org, r.id, 'DEC-001',
         (SELECT sg.id FROM public.stage_gates sg
          WHERE sg.project_id = r.id AND sg.stream_id = r.core_id
          ORDER BY sg.planned_date LIMIT 1),
         'Adopt Core + Experience streams',
         'Core + Experience streams approved for the portal',
         CURRENT_DATE - 40, r.sponsor,
         'Clear ownership of dates, gates and finance per stream',
         'Enables rollup timelines and PvA by stream', 'Approved'),
        ('e2e00001-a004-4000-8000-000000000002', v_org, r.id, 'DEC-002',
         (SELECT sg.id FROM public.stage_gates sg
          WHERE sg.project_id = r.id AND sg.stream_id = r.core_id
            AND sg.gate_name = 'Business Case / Full Funding'
          ORDER BY sg.planned_date LIMIT 1),
         'Confirm Hybrid delivery',
         'Confirm Hybrid approach for Customer Portal Redesign',
         CURRENT_DATE - 30, r.sponsor,
         'Aligns cadence with Experience dependencies',
         'Sprint + stage-gate hybrid where needed', 'Approved');

    ELSIF r.project_code = 'PRJ-002' THEN
      INSERT INTO public.risks (
        id, org_id, project_id, raid_code, title, description, category,
        probability, impact, severity, status, owner, mitigation, due_date
      ) VALUES
        ('e2e00002-a001-4000-8000-000000000001', v_org, r.id, 'RSK-001',
         'Integration specialist capacity', 'API specialists are fully allocated across the platform program',
         'Resource', 3, 4, 12, 'Open', r.sponsor, 'Prioritise core API critical path; surge contractors', CURRENT_DATE + 30),
        ('e2e00002-a001-4000-8000-000000000002', v_org, r.id, 'RSK-002',
         'Core release-train slip', 'Upstream core banking release train may slip Platform stream work',
         'Dependency', 4, 3, 12, 'Open', r.sponsor, 'Weekly dependency forum; contingency adapters', CURRENT_DATE + 21),
        ('e2e00002-a001-4000-8000-000000000003', v_org, r.id, 'RSK-003',
         'Unscoped platform adapters', 'Platform stream adding adapters outside the agreed contract set',
         'Scope', 2, 3, 6, 'Mitigating', r.sponsor, 'Change board; freeze adapter catalogue after Design', CURRENT_DATE + 45);

      INSERT INTO public.issues (
        id, org_id, project_id, raid_code, title, description, priority, status, owner, raised_date, target_date
      ) VALUES
        ('e2e00002-a002-4000-8000-000000000001', v_org, r.id, 'ISS-001',
         'Core sandbox access', 'Non-prod core sandbox still pending for Platform stream',
         'Medium', 'Open', r.sponsor, CURRENT_DATE - 7, CURRENT_DATE + 14),
        ('e2e00002-a002-4000-8000-000000000002', v_org, r.id, 'ISS-002',
         'Vendor security questionnaire', 'Third-party awaiting security questionnaire',
         'High', 'Open', r.sponsor, CURRENT_DATE - 3, CURRENT_DATE + 10);

      INSERT INTO public.actions (
        id, org_id, project_id, raid_code, title, description, owner, due_date, status, priority, completed_date
      ) VALUES
        ('e2e00002-a003-4000-8000-000000000001', v_org, r.id, 'ACT-001',
         'Confirm FY API drawdown', 'Validate drawdown against FY allocations',
         r.sponsor, CURRENT_DATE + 14, 'Open', 'Medium', NULL),
        ('e2e00002-a003-4000-8000-000000000002', v_org, r.id, 'ACT-002',
         'Core + Platform RAID review', 'Joint RAID review across both streams',
         r.sponsor, CURRENT_DATE + 7, 'Open', 'High', NULL),
        ('e2e00002-a003-4000-8000-000000000003', v_org, r.id, 'ACT-003',
         'Publish program board pack', 'Fortnightly pack for Program Board',
         r.sponsor, CURRENT_DATE + 3, 'In Progress', 'Medium', NULL),
        ('e2e00002-a003-4000-8000-000000000004', v_org, r.id, 'ACT-004',
         'Close last steering actions', 'Actions agreed at last steering are complete',
         r.sponsor, CURRENT_DATE - 2, 'Done', 'Medium', CURRENT_DATE - 3);

      INSERT INTO public.decisions (
        id, org_id, project_id, raid_code, stage_gate_id, title, description,
        decision_date, decided_by, rationale, impact, status
      ) VALUES
        ('e2e00002-a004-4000-8000-000000000001', v_org, r.id, 'DEC-001',
         (SELECT sg.id FROM public.stage_gates sg
          WHERE sg.project_id = r.id AND sg.stream_id = r.core_id
          ORDER BY sg.planned_date LIMIT 1),
         'Adopt Core + Platform streams',
         'Core + Platform streams approved for the API platform',
         CURRENT_DATE - 40, r.sponsor,
         'Clear ownership of dates, gates and finance per stream',
         'Enables rollup timelines and PvA by stream', 'Approved'),
        ('e2e00002-a004-4000-8000-000000000002', v_org, r.id, 'DEC-002',
         (SELECT sg.id FROM public.stage_gates sg
          WHERE sg.project_id = r.id AND sg.stream_id = r.core_id
            AND sg.gate_name = 'Business Case / Full Funding'
          ORDER BY sg.planned_date LIMIT 1),
         'Confirm Agile delivery',
         'Confirm Agile approach for Core Banking API Platform',
         CURRENT_DATE - 30, r.sponsor,
         'Aligns cadence with platform dependencies',
         'Sprint cadence without stage gates', 'Approved');

    ELSIF r.project_code = 'PRJ-003' THEN
      INSERT INTO public.risks (
        id, org_id, project_id, raid_code, title, description, category,
        probability, impact, severity, status, owner, mitigation, due_date
      ) VALUES
        ('e2e00003-a001-4000-8000-000000000001', v_org, r.id, 'RSK-001',
         'Data engineering capacity', 'Lakehouse build contends for data engineering across the portfolio',
         'Resource', 3, 4, 12, 'Open', r.sponsor, 'Prioritise ingest critical path; surge contractors', CURRENT_DATE + 30),
        ('e2e00003-a001-4000-8000-000000000002', v_org, r.id, 'RSK-002',
         'Extract dependency on core APIs', 'Source extracts depend on the core banking API platform',
         'Dependency', 4, 3, 12, 'Open', r.sponsor, 'Weekly dependency forum; file-drop contingency', CURRENT_DATE + 21),
        ('e2e00003-a001-4000-8000-000000000003', v_org, r.id, 'RSK-003',
         'Catalog scope expansion', 'Data stream catalogue requirements expanding',
         'Scope', 2, 3, 6, 'Mitigating', r.sponsor, 'Change board; freeze catalogue after Design', CURRENT_DATE + 45);

      INSERT INTO public.issues (
        id, org_id, project_id, raid_code, title, description, priority, status, owner, raised_date, target_date
      ) VALUES
        ('e2e00003-a002-4000-8000-000000000001', v_org, r.id, 'ISS-001',
         'Landing-zone delay', 'Non-prod lakehouse landing zone delayed for Data stream',
         'Medium', 'Open', r.sponsor, CURRENT_DATE - 7, CURRENT_DATE + 14),
        ('e2e00003-a002-4000-8000-000000000002', v_org, r.id, 'ISS-002',
         'Catalog vendor questionnaire', 'Catalogue tool vendor awaiting security questionnaire',
         'High', 'Open', r.sponsor, CURRENT_DATE - 3, CURRENT_DATE + 10);

      INSERT INTO public.actions (
        id, org_id, project_id, raid_code, title, description, owner, due_date, status, priority, completed_date
      ) VALUES
        ('e2e00003-a003-4000-8000-000000000001', v_org, r.id, 'ACT-001',
         'Confirm FY lakehouse drawdown', 'Validate drawdown against FY allocations',
         r.sponsor, CURRENT_DATE + 14, 'Open', 'Medium', NULL),
        ('e2e00003-a003-4000-8000-000000000002', v_org, r.id, 'ACT-002',
         'Core + Data RAID workshop', 'Joint RAID review across both streams',
         r.sponsor, CURRENT_DATE + 7, 'Open', 'High', NULL),
        ('e2e00003-a003-4000-8000-000000000003', v_org, r.id, 'ACT-003',
         'Publish data steering pack', 'Monthly status for data steering',
         r.sponsor, CURRENT_DATE + 3, 'In Progress', 'Medium', NULL),
        ('e2e00003-a003-4000-8000-000000000004', v_org, r.id, 'ACT-004',
         'Close last steering actions', 'Actions agreed at last steering are complete',
         r.sponsor, CURRENT_DATE - 2, 'Done', 'Medium', CURRENT_DATE - 3);

      INSERT INTO public.decisions (
        id, org_id, project_id, raid_code, stage_gate_id, title, description,
        decision_date, decided_by, rationale, impact, status
      ) VALUES
        ('e2e00003-a004-4000-8000-000000000001', v_org, r.id, 'DEC-001',
         (SELECT sg.id FROM public.stage_gates sg
          WHERE sg.project_id = r.id AND sg.stream_id = r.core_id
          ORDER BY sg.planned_date LIMIT 1),
         'Adopt Core + Data streams',
         'Core + Data streams approved for the lakehouse',
         CURRENT_DATE - 40, r.sponsor,
         'Clear ownership of dates, gates and finance per stream',
         'Enables rollup timelines and PvA by stream', 'Approved'),
        ('e2e00003-a004-4000-8000-000000000002', v_org, r.id, 'DEC-002',
         (SELECT sg.id FROM public.stage_gates sg
          WHERE sg.project_id = r.id AND sg.stream_id = r.core_id
            AND sg.gate_name = 'Business Case / Full Funding'
          ORDER BY sg.planned_date LIMIT 1),
         'Confirm Waterfall delivery',
         'Confirm Waterfall approach for Data Lakehouse Foundation',
         CURRENT_DATE - 30, r.sponsor,
         'Aligns cadence with sequential ingest gates',
         'Sequential stage-gate delivery', 'Approved');

    ELSIF r.project_code = 'PRJ-004' THEN
      INSERT INTO public.risks (
        id, org_id, project_id, raid_code, title, description, category,
        probability, impact, severity, status, owner, mitigation, due_date
      ) VALUES
        ('e2e00004-a001-4000-8000-000000000001', v_org, r.id, 'RSK-001',
         'Shared security architects', 'Security architects are shared across P1s',
         'Resource', 3, 4, 12, 'Open', r.sponsor, 'Prioritise control critical path; surge contractors', CURRENT_DATE + 30),
        ('e2e00004-a001-4000-8000-000000000002', v_org, r.id, 'RSK-002',
         'Identity platform dependency', 'Identity platform upgrade may slip Security stream work',
         'Dependency', 4, 3, 12, 'Open', r.sponsor, 'Weekly dependency forum; compensating controls', CURRENT_DATE + 21),
        ('e2e00004-a001-4000-8000-000000000003', v_org, r.id, 'RSK-003',
         'Control-set expansion', 'Security stream control-set expanding beyond the agreed uplift',
         'Scope', 2, 3, 6, 'Mitigating', r.sponsor, 'Change board; freeze control-set after Design', CURRENT_DATE + 45);

      INSERT INTO public.issues (
        id, org_id, project_id, raid_code, title, description, priority, status, owner, raised_date, target_date
      ) VALUES
        ('e2e00004-a002-4000-8000-000000000001', v_org, r.id, 'ISS-001',
         'Pentest environment pending', 'Non-prod pentest environment still pending for Security stream',
         'Medium', 'Open', r.sponsor, CURRENT_DATE - 7, CURRENT_DATE + 14),
        ('e2e00004-a002-4000-8000-000000000002', v_org, r.id, 'ISS-002',
         'MSSP questionnaire lag', 'MSSP awaiting security questionnaire',
         'High', 'Open', r.sponsor, CURRENT_DATE - 3, CURRENT_DATE + 10);

      INSERT INTO public.actions (
        id, org_id, project_id, raid_code, title, description, owner, due_date, status, priority, completed_date
      ) VALUES
        ('e2e00004-a003-4000-8000-000000000001', v_org, r.id, 'ACT-001',
         'Confirm FY cyber drawdown', 'Validate drawdown against FY allocations',
         r.sponsor, CURRENT_DATE + 14, 'Open', 'Medium', NULL),
        ('e2e00004-a003-4000-8000-000000000002', v_org, r.id, 'ACT-002',
         'Core + Security RAID workshop', 'Joint RAID review across both streams',
         r.sponsor, CURRENT_DATE + 7, 'Open', 'High', NULL),
        ('e2e00004-a003-4000-8000-000000000003', v_org, r.id, 'ACT-003',
         'Publish CISO steering pack', 'Monthly status for cyber steering',
         r.sponsor, CURRENT_DATE + 3, 'In Progress', 'Medium', NULL),
        ('e2e00004-a003-4000-8000-000000000004', v_org, r.id, 'ACT-004',
         'Close last steering actions', 'Actions agreed at last steering are complete',
         r.sponsor, CURRENT_DATE - 2, 'Done', 'Medium', CURRENT_DATE - 3);

      INSERT INTO public.decisions (
        id, org_id, project_id, raid_code, stage_gate_id, title, description,
        decision_date, decided_by, rationale, impact, status
      ) VALUES
        ('e2e00004-a004-4000-8000-000000000001', v_org, r.id, 'DEC-001',
         (SELECT sg.id FROM public.stage_gates sg
          WHERE sg.project_id = r.id AND sg.stream_id = r.core_id
          ORDER BY sg.planned_date LIMIT 1),
         'Adopt Core + Security streams',
         'Core + Security streams approved for the cyber uplift',
         CURRENT_DATE - 40, r.sponsor,
         'Clear ownership of dates, gates and finance per stream',
         'Enables rollup timelines and PvA by stream', 'Approved'),
        ('e2e00004-a004-4000-8000-000000000002', v_org, r.id, 'DEC-002',
         (SELECT sg.id FROM public.stage_gates sg
          WHERE sg.project_id = r.id AND sg.stream_id = r.core_id
            AND sg.gate_name = 'Business Case / Full Funding'
          ORDER BY sg.planned_date LIMIT 1),
         'Confirm Hybrid delivery',
         'Confirm Hybrid approach for Cyber Resilience Uplift',
         CURRENT_DATE - 30, r.sponsor,
         'Aligns cadence with control and identity dependencies',
         'Sprint + stage-gate hybrid where needed', 'Approved');
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Run this after COMMIT to copy IDs (uuid + human raid_code) for the four projects.
SELECT p.project_code,
       p.name AS project_name,
       x.kind,
       x.raid_code,
       x.id,
       x.title
FROM public.projects p
JOIN (
  SELECT 'risk' AS kind, id, project_id, raid_code, title FROM public.risks
  UNION ALL
  SELECT 'issue', id, project_id, raid_code, title FROM public.issues
  UNION ALL
  SELECT 'action', id, project_id, raid_code, title FROM public.actions
  UNION ALL
  SELECT 'decision', id, project_id, raid_code, title FROM public.decisions
) x ON x.project_id = p.id
JOIN public.organizations o ON o.id = p.org_id
WHERE o.slug = 'iprojectx'
  AND p.project_code IN ('PRJ-001', 'PRJ-002', 'PRJ-003', 'PRJ-004')
ORDER BY p.project_code, x.kind, x.raid_code;
