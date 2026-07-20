
-- Seed sample risks (roadmap needs data) and FY allocations for financial views.
DO $$
DECLARE
  v_org uuid;
  r RECORD;
  i int;
  cats text[] := ARRAY['Schedule','Cost','Scope','Resource','Technical','Compliance','Vendor','Security'];
  owners text[] := ARRAY['J. Kim','A. Patel','C. Ng','R. Diaz','L. Chen','M. Novak','S. Ahmed','P. O''Brien'];
  statuses text[] := ARRAY['Open','Open','Open','Mitigating','Mitigating','Closed'];
  n_risks int;
BEGIN
  FOR r IN SELECT id, org_id, start_date, end_date FROM public.projects LOOP
    v_org := r.org_id;
    n_risks := 3 + (abs(hashtext(r.id::text)) % 3);  -- 3..5 per project
    FOR i IN 1..n_risks LOOP
      INSERT INTO public.risks (org_id, project_id, title, category, owner, status, probability, impact, severity, due_date, description, mitigation)
      VALUES (
        v_org, r.id,
        (cats[1 + (abs(hashtext(r.id::text || i::text)) % array_length(cats,1))]) || ' risk #' || i,
        cats[1 + (abs(hashtext(r.id::text || i::text || 'c')) % array_length(cats,1))],
        owners[1 + (abs(hashtext(r.id::text || i::text || 'o')) % array_length(owners,1))],
        statuses[1 + (abs(hashtext(r.id::text || i::text || 's')) % array_length(statuses,1))],
        1 + (abs(hashtext(r.id::text || i::text || 'p')) % 5),
        1 + (abs(hashtext(r.id::text || i::text || 'i')) % 5),
        1 + (abs(hashtext(r.id::text || i::text || 'v')) % 25),
        COALESCE(r.start_date, CURRENT_DATE) + ((abs(hashtext(r.id::text || i::text || 'd')) % 400))::int,
        'Auto-seeded risk for pilot data set',
        'Weekly review with sponsor & mitigation tracker'
      );
    END LOOP;

    -- FY Allocations: split budget across each FY the project spans (Apr–Mar UK/AU basis)
    IF r.start_date IS NOT NULL AND r.end_date IS NOT NULL THEN
      DECLARE
        fy_start int := CASE WHEN EXTRACT(MONTH FROM r.start_date) >= 4 THEN EXTRACT(YEAR FROM r.start_date)::int ELSE EXTRACT(YEAR FROM r.start_date)::int - 1 END;
        fy_end   int := CASE WHEN EXTRACT(MONTH FROM r.end_date)   >= 4 THEN EXTRACT(YEAR FROM r.end_date)::int   ELSE EXTRACT(YEAR FROM r.end_date)::int - 1 END;
        n int := (fy_end - fy_start + 1);
        b numeric;
        c numeric; o numeric; bn numeric;
        y int;
      BEGIN
        SELECT budget, COALESCE(capex_approved,0), COALESCE(opex_approved,0), COALESCE(benefits_target,0)
          INTO b, c, o, bn FROM public.projects WHERE id = r.id;
        IF n < 1 THEN n := 1; END IF;
        FOR y IN fy_start..fy_end LOOP
          INSERT INTO public.fy_allocations (org_id, project_id, fy, capex, opex, benefits)
          VALUES (v_org, r.id, 'FY' || RIGHT((y+1)::text, 2), c/n, o/n, bn/n);
        END LOOP;
      END;
    END IF;
  END LOOP;
END $$;
