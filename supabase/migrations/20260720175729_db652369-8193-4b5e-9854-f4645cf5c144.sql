
-- 1. Add owner + notes columns where missing
ALTER TABLE public.risks ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.actions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.decisions ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE public.decisions ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS owner text;
ALTER TABLE public.change_requests ADD COLUMN IF NOT EXISTS notes text;

-- 2. Sample data (idempotent - skip if any rows already present per table)
DO $$
DECLARE
  v_org uuid;
  proj RECORD;
  i int;
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  -- RISKS
  IF NOT EXISTS (SELECT 1 FROM public.risks) THEN
    i := 0;
    FOR proj IN SELECT id, name FROM public.projects WHERE org_id = v_org LIMIT 12 LOOP
      i := i + 1;
      INSERT INTO public.risks (org_id, project_id, title, description, category, probability, impact, severity, status, owner, mitigation, notes, due_date) VALUES
        (v_org, proj.id, 'Vendor delivery slippage on ' || proj.name, 'Third-party vendor showing signs of missing agreed dates.', 'Supplier', 4, 4, 16, 'Open', 'Priya Nair', 'Escalate to vendor governance; secondary supplier on standby.', 'Weekly steering check-in scheduled.', CURRENT_DATE + 21),
        (v_org, proj.id, 'Data quality gap in source system', 'Migration source records missing mandatory fields.', 'Data', 3, 4, 12, 'Mitigating', 'Alex Chen', 'Data cleansing sprint added to plan.', 'Owner sending daily quality report.', CURRENT_DATE + 14),
        (v_org, proj.id, 'Key SME unavailable during UAT window', 'Only one subject matter expert available for UAT.', 'Resource', 3, 3, 9, 'Open', 'Marta Silva', 'Cross-train backup SME; book calendar early.', CASE WHEN i % 2 = 0 THEN 'Backup identified.' ELSE 'Awaiting sponsor confirmation.' END, CURRENT_DATE + 30);
    END LOOP;
  END IF;

  -- ACTIONS
  IF NOT EXISTS (SELECT 1 FROM public.actions) THEN
    i := 0;
    FOR proj IN SELECT id, name FROM public.projects WHERE org_id = v_org LIMIT 12 LOOP
      i := i + 1;
      INSERT INTO public.actions (org_id, project_id, title, description, owner, priority, status, due_date, notes) VALUES
        (v_org, proj.id, 'Confirm go-live date with business', 'Align stakeholders on final cutover window.', 'Ravi Kumar', 'High', 'Open', CURRENT_DATE + 7, 'Comms drafted, awaiting sponsor sign-off.'),
        (v_org, proj.id, 'Close RAID items older than 30 days', 'Audit and close stale register items.', 'Anna Weber', 'Medium', CASE WHEN i % 3 = 0 THEN 'Closed' ELSE 'In Progress' END, CURRENT_DATE + 14, 'Weekly grooming session established.'),
        (v_org, proj.id, 'Publish updated project brief', 'Refresh sponsor / solution manager sections.', 'Jordan Blake', 'Low', 'Open', CURRENT_DATE + 21, 'Template merged from Data Editor.');
    END LOOP;
  END IF;

  -- DECISIONS
  IF NOT EXISTS (SELECT 1 FROM public.decisions) THEN
    FOR proj IN SELECT id, name, program, sponsor FROM public.projects WHERE org_id = v_org LIMIT 10 LOOP
      INSERT INTO public.decisions (org_id, project_id, title, description, decision_date, decided_by, rationale, impact, status, program, forum, sponsor, approvers, outcome, owner, notes) VALUES
        (v_org, proj.id, 'Approve budget uplift for ' || proj.name, 'Additional funding needed for scope expansion.', CURRENT_DATE - 5, proj.sponsor, 'ROI remains above threshold after uplift.', 'Positive', 'Approved', proj.program, 'Portfolio Board', proj.sponsor, 'CFO, CTO', 'Approved', proj.sponsor, 'Follow-up review at next quarterly gate.'),
        (v_org, proj.id, 'Defer non-critical scope item', 'Re-baseline scope to protect MVP delivery date.', CURRENT_DATE - 12, proj.sponsor, 'Timeline risk outweighs scope benefit.', 'Neutral', 'Approved', proj.program, 'Change Advisory Board', proj.sponsor, 'Delivery Lead', 'On Hold', proj.sponsor, 'Item added to backlog for FY+1 consideration.');
    END LOOP;
  END IF;

  -- CHANGE REQUESTS (release / change register)
  IF NOT EXISTS (SELECT 1 FROM public.change_requests) THEN
    i := 0;
    FOR proj IN SELECT id, name, sponsor FROM public.projects WHERE org_id = v_org LIMIT 12 LOOP
      i := i + 1;
      INSERT INTO public.change_requests (org_id, project_id, cr_number, title, description, change_type, impact_scope, impact_schedule_days, impact_cost, status, raised_by, raised_date, decision_date, approver, owner, notes) VALUES
        (v_org, proj.id, 'CR-' || LPAD(i::text, 4, '0'), 'Add analytics module to ' || proj.name, 'Business requested extra reporting capability.', 'Scope', 'Medium', 10, 45000, CASE WHEN i % 3 = 0 THEN 'Approved' WHEN i % 3 = 1 THEN 'Submitted' ELSE 'In Review' END, 'Sam Patel', CURRENT_DATE - 20, CURRENT_DATE - 5, proj.sponsor, 'Sam Patel', 'Design workshop planned for next sprint.'),
        (v_org, proj.id, 'CR-' || LPAD((i+100)::text, 4, '0'), 'Shift release window by two weeks', 'Business freeze conflict — realign release date.', 'Schedule', 'High', 14, 12000, CASE WHEN i % 2 = 0 THEN 'Approved' ELSE 'Submitted' END, 'Elena Rossi', CURRENT_DATE - 10, NULL, proj.sponsor, 'Elena Rossi', 'Communication drafted; stakeholders notified.');
    END LOOP;
  END IF;
END $$;
