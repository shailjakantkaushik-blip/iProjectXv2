-- =============================================================================
-- iProjectX — Seed resources + monthly allocations (for Resources screens)
-- Run in: Supabase SQL Editor
--
-- Does NOT touch users/orgs/projects.
-- Clears and recreates resources + resource_allocations for every organisation
-- that already has projects (uses those projects for allocations).
-- =============================================================================

BEGIN;

-- Clear allocation + roster data (org structure / projects kept)
DELETE FROM public.resource_allocations;
DELETE FROM public.resources;

DO $$
DECLARE
  org RECORD;
  bu_ids uuid[];
  bu uuid;
  proj_ids uuid[];
  proj uuid;
  r_ids uuid[] := ARRAY[]::uuid[];
  rid uuid;
  i int;
  m int;
  month_start date;
  n_proj int;
  pct numeric;
  hours numeric;
  role_on text;
  r_name text;
  r_role text;
  r_skills text;
  r_loc text;
  r_status text;
  r_rate numeric;
  r_cap numeric;
  email text;
  proj2 uuid;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP
    SELECT array_agg(id ORDER BY name) INTO bu_ids
    FROM public.business_units WHERE org_id = org.id;

    SELECT array_agg(id ORDER BY project_code NULLS LAST, name)
    INTO proj_ids
    FROM public.projects
    WHERE org_id = org.id
      AND coalesce(status::text, '') NOT IN ('Cancelled');

    IF proj_ids IS NULL OR array_length(proj_ids, 1) IS NULL THEN
      RAISE NOTICE 'Org % has no projects — skipping resource seed', org.id;
      CONTINUE;
    END IF;

    n_proj := array_length(proj_ids, 1);
    r_ids := ARRAY[]::uuid[];

    -- 14 sample resources with varied skills / utilisation profile
    FOR i IN 1..14 LOOP
      CASE i
        WHEN 1 THEN
          r_name := 'Alex Chen'; r_role := 'Delivery Lead';
          r_skills := 'Agile, Stakeholder Mgmt, Delivery'; r_loc := 'London';
          r_status := 'Active'; r_rate := 95; r_cap := 40;
        WHEN 2 THEN
          r_name := 'Priya Nair'; r_role := 'Business Analyst';
          r_skills := 'Requirements, Process Design, BPMN'; r_loc := 'Manchester';
          r_status := 'Active'; r_rate := 72; r_cap := 40;
        WHEN 3 THEN
          r_name := 'Jordan Blake'; r_role := 'Solution Architect';
          r_skills := 'Architecture, APIs, Cloud'; r_loc := 'London';
          r_status := 'Active'; r_rate := 110; r_cap := 40;
        WHEN 4 THEN
          r_name := 'Sam Patel'; r_role := 'Full Stack Engineer';
          r_skills := 'React, TypeScript, Node'; r_loc := 'Birmingham';
          r_status := 'Active'; r_rate := 85; r_cap := 40;
        WHEN 5 THEN
          r_name := 'Elena Rossi'; r_role := 'Data Engineer';
          r_skills := 'SQL, Python, ETL, Data Platform'; r_loc := 'Leeds';
          r_status := 'Active'; r_rate := 90; r_cap := 40;
        WHEN 6 THEN
          r_name := 'Marcus Chen'; r_role := 'Data Scientist';
          r_skills := 'ML, Python, Fraud Analytics'; r_loc := 'London';
          r_status := 'Active'; r_rate := 105; r_cap := 37.5;
        WHEN 7 THEN
          r_name := 'Anna Weber'; r_role := 'PMO Analyst';
          r_skills := 'Reporting, Financials, RAID'; r_loc := 'Remote';
          r_status := 'Active'; r_rate := 65; r_cap := 40;
        WHEN 8 THEN
          r_name := 'Ravi Kumar'; r_role := 'QA Lead';
          r_skills := 'Test Strategy, Automation, UAT'; r_loc := 'Edinburgh';
          r_status := 'Active'; r_rate := 78; r_cap := 40;
        WHEN 9 THEN
          r_name := 'Helen Park'; r_role := 'Change Manager';
          r_skills := 'Change, Comms, Training'; r_loc := 'London';
          r_status := 'Active'; r_rate := 80; r_cap := 40;
        WHEN 10 THEN
          r_name := 'Sofia Alvarez'; r_role := 'Security Specialist';
          r_skills := 'IAM, Security, Compliance'; r_loc := 'Remote';
          r_status := 'Active'; r_rate := 100; r_cap := 40;
        WHEN 11 THEN
          r_name := 'James Whitfield'; r_role := 'Cloud Engineer';
          r_skills := 'AWS, Networking, DevOps'; r_loc := 'Bristol';
          r_status := 'Active'; r_rate := 92; r_cap := 40;
        WHEN 12 THEN
          r_name := 'Marta Silva'; r_role := 'UX Designer';
          r_skills := 'UX, UI, Research'; r_loc := 'London';
          r_status := 'Active'; r_rate := 75; r_cap := 40;
        WHEN 13 THEN
          r_name := 'Tom Okonkwo'; r_role := 'Scrum Master';
          r_skills := 'Agile, Facilitation, Coaching'; r_loc := 'Manchester';
          r_status := 'Active'; r_rate := 70; r_cap := 40;
        ELSE
          r_name := 'Chris Novak'; r_role := 'Contractor - Engineer';
          r_skills := 'Java, Integration, APIs'; r_loc := 'Contractor';
          r_status := 'On Leave'; r_rate := 120; r_cap := 40;
      END CASE;

      bu := CASE
        WHEN bu_ids IS NULL OR array_length(bu_ids, 1) IS NULL THEN NULL
        ELSE bu_ids[1 + ((i - 1) % array_length(bu_ids, 1))]
      END;

      email := lower(replace(r_name, ' ', '.')) || '@example.com';

      INSERT INTO public.resources (
        org_id, bu_id, name, email, role, skills,
        capacity_hours_week, cost_rate, location, status
      ) VALUES (
        org.id, bu, r_name, email, r_role, r_skills,
        r_cap, r_rate, r_loc, r_status
      )
      RETURNING id INTO rid;

      r_ids := array_append(r_ids, rid);
    END LOOP;

    -- Monthly allocations: current month -5 .. +6 (12 months)
    FOR m IN 0..11 LOOP
      month_start := (date_trunc('month', CURRENT_DATE) + ((m - 5) || ' months')::interval)::date;

      FOR i IN 1..array_length(r_ids, 1) LOOP
        rid := r_ids[i];

        -- Skip most months for the on-leave contractor
        IF i = 14 AND (m % 3) <> 0 THEN
          CONTINUE;
        END IF;

        -- Primary project (rotates)
        proj := proj_ids[1 + ((i + m - 1) % n_proj)];
        pct := CASE
          WHEN i IN (1, 3, 4) THEN 60 + ((i + m) % 5) * 8   -- often busy / over
          WHEN i IN (2, 7, 13) THEN 35 + ((i + m) % 4) * 5  -- moderate
          WHEN i IN (5, 6, 10, 11) THEN 50 + ((m + i) % 6) * 7
          WHEN i = 14 THEN 80
          ELSE 25 + ((i + m) % 5) * 6                       -- lighter
        END;
        pct := least(100, pct);
        hours := round((pct / 100.0) * 160, 1); -- ~month hours at that %
        role_on := (SELECT role FROM public.resources WHERE id = rid);

        INSERT INTO public.resource_allocations (
          org_id, project_id, resource_id, period_month,
          allocation_percent, allocated_hours, role_on_project
        ) VALUES (
          org.id, proj, rid, month_start, pct, hours, role_on
        )
        ON CONFLICT (project_id, resource_id, period_month) DO UPDATE
          SET allocation_percent = EXCLUDED.allocation_percent,
              allocated_hours = EXCLUDED.allocated_hours,
              role_on_project = EXCLUDED.role_on_project;

        -- Secondary project for some people (overload / multi-project demand)
        IF i IN (1, 3, 4, 5, 8, 11) AND n_proj > 1 THEN
          proj2 := proj_ids[1 + ((i + m + 3) % n_proj)];
          IF proj2 IS DISTINCT FROM proj THEN
            pct := 15 + ((i + m) % 4) * 5;
            hours := round((pct / 100.0) * 160, 1);
            INSERT INTO public.resource_allocations (
              org_id, project_id, resource_id, period_month,
              allocation_percent, allocated_hours, role_on_project
            ) VALUES (
              org.id, proj2, rid, month_start, pct, hours, 'Supporting'
            )
            ON CONFLICT (project_id, resource_id, period_month) DO NOTHING;
          END IF;
        END IF;
      END LOOP;
    END LOOP;

  END LOOP;
END $$;

COMMIT;

-- Verification
SELECT
  (SELECT count(*) FROM public.resources) AS resources,
  (SELECT count(*) FROM public.resource_allocations) AS allocations,
  (SELECT round(avg(allocation_percent), 1) FROM public.resource_allocations) AS avg_alloc_pct;
