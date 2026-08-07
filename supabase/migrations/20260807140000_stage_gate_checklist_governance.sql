-- Align stage-gate checklist templates with org stage_gate_definitions names.
-- Additive / safe to re-run. Does not remove legacy Initiate/Plan/… templates.

-- Seed governance checklists for the standard 9-gate waterfall (and any org
-- that already uses these definition names).
INSERT INTO public.stage_gate_checklist_items (org_id, gate_name, title, required, sort_order)
SELECT o.id, i.gate_name, i.title, i.required, i.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  -- Discovery
  ('Discovery', 'Problem / opportunity statement agreed', true, 10),
  ('Discovery', 'Stakeholders identified', true, 20),
  ('Discovery', 'Initial options shortlist documented', false, 30),
  -- Business Case / Seed Funding
  ('Business Case / Seed Funding', 'Draft business case attached', true, 10),
  ('Business Case / Seed Funding', 'Seed funding amount proposed', true, 20),
  ('Business Case / Seed Funding', 'Sponsor endorsement recorded', true, 30),
  -- Design
  ('Design', 'Solution design approved', true, 10),
  ('Design', 'Architecture / security review complete', true, 20),
  ('Design', 'Dependencies & integration map updated', true, 30),
  ('Design', 'Non-functional requirements captured', false, 40),
  -- Business Case / Full Funding
  ('Business Case / Full Funding', 'Full business case approved', true, 10),
  ('Business Case / Full Funding', 'Budget & benefits baseline set', true, 20),
  ('Business Case / Full Funding', 'Delivery approach confirmed', true, 30),
  -- Build
  ('Build', 'Delivery plan current', true, 10),
  ('Build', 'RAID log reviewed this stage', true, 20),
  ('Build', 'Build quality checks passed', true, 30),
  ('Build', 'Benefits tracker live', false, 40),
  -- Testing
  ('Testing', 'Test strategy / plan approved', true, 10),
  ('Testing', 'UAT / acceptance criteria signed off', true, 20),
  ('Testing', 'Defects at exit criteria', true, 30),
  ('Testing', 'Security / performance tests complete', false, 40),
  -- Deployment
  ('Deployment', 'Go-live readiness checklist complete', true, 10),
  ('Deployment', 'Rollback plan documented', true, 20),
  ('Deployment', 'Support / ops handover confirmed', true, 30),
  -- Handover
  ('Handover', 'Operational documentation handed over', true, 10),
  ('Handover', 'Training completed', true, 20),
  ('Handover', 'Warranty / hypercare plan agreed', false, 30),
  -- Benefit Realisation
  ('Benefit Realisation', 'Benefits measures baseline confirmed', true, 10),
  ('Benefit Realisation', 'Owner for each benefit assigned', true, 20),
  ('Benefit Realisation', 'First benefits review scheduled', true, 30)
) AS i(gate_name, title, required, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.stage_gate_checklist_items x
  WHERE x.org_id = o.id AND x.gate_name = i.gate_name AND x.title = i.title
);

-- Also seed for any active definition name that still has zero template rows,
-- using a minimal generic pack (orgs with custom gate names).
INSERT INTO public.stage_gate_checklist_items (org_id, gate_name, title, required, sort_order)
SELECT d.org_id, d.gate_name, g.title, g.required, g.sort_order
FROM public.stage_gate_definitions d
CROSS JOIN (VALUES
  ('Entry criteria met / prior gate closed', true, 10),
  ('Stage review pack attached', true, 20),
  ('Risks, issues & decisions reviewed', true, 30),
  ('Sponsor / forum endorsement recorded', true, 40)
) AS g(title, required, sort_order)
WHERE COALESCE(d.is_active, true)
  AND NOT EXISTS (
    SELECT 1 FROM public.stage_gate_checklist_items x
    WHERE x.org_id = d.org_id AND x.gate_name = d.gate_name
  );

COMMENT ON TABLE public.stage_gate_checklist_items IS
  'Org-level checklist templates keyed by gate_name (matches stage_gate_definitions.gate_name).';
COMMENT ON TABLE public.stage_gate_checklist_responses IS
  'Per stage_gate instance completion + evidence against org checklist templates.';
