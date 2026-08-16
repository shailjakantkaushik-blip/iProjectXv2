-- Scoped governance forums: project / program / Strategic Alignment.
-- Project forums auto-create from templates; program and SA forums are shared.
-- Members (resources) attach to project forums. PM can configure project forums;
-- org admin configures templates and program/SA forums.
-- Idempotent. Does not rename existing columns.
-- Then paste governance_weekday_meeting_dates.sql so last/next meeting dates
-- default from cadence on weekdays only.

-- =============================================================================
-- 1) Channel scope columns
-- =============================================================================
ALTER TABLE public.governance_channels
  ADD COLUMN IF NOT EXISTS scope_level text NOT NULL DEFAULT 'strategic_alignment',
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS program text,
  ADD COLUMN IF NOT EXISTS portfolio text;

UPDATE public.governance_channels
SET scope_level = 'strategic_alignment'
WHERE scope_level IS NULL OR btrim(scope_level) = '';

ALTER TABLE public.governance_channels
  DROP CONSTRAINT IF EXISTS governance_channels_scope_chk;

ALTER TABLE public.governance_channels
  ADD CONSTRAINT governance_channels_scope_chk CHECK (
    scope_level IN ('project', 'program', 'strategic_alignment')
    AND (
      (scope_level = 'project' AND project_id IS NOT NULL)
      OR (scope_level = 'program' AND project_id IS NULL AND coalesce(btrim(program), '') <> '')
      OR (scope_level = 'strategic_alignment' AND project_id IS NULL)
    )
  );

-- Avoid unique-index failure if an org already has duplicate org-wide names.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id,
           row_number() OVER (
             PARTITION BY org_id, lower(name), lower(coalesce(portfolio, ''))
             ORDER BY created_at, id
           ) AS n
    FROM public.governance_channels
    WHERE scope_level = 'strategic_alignment'
  LOOP
    IF r.n > 1 THEN
      UPDATE public.governance_channels
      SET name = name || ' (' || r.n || ')'
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_ch_project_name
  ON public.governance_channels (project_id, lower(name))
  WHERE scope_level = 'project';

CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_ch_program_name
  ON public.governance_channels (org_id, lower(program), lower(name))
  WHERE scope_level = 'program';

CREATE UNIQUE INDEX IF NOT EXISTS idx_gov_ch_sa_name
  ON public.governance_channels (org_id, lower(coalesce(portfolio, '')), lower(name))
  WHERE scope_level = 'strategic_alignment';

CREATE INDEX IF NOT EXISTS idx_gov_ch_org_scope
  ON public.governance_channels (org_id, scope_level);
CREATE INDEX IF NOT EXISTS idx_gov_ch_project
  ON public.governance_channels (project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN public.governance_channels.scope_level IS
  'project | program | strategic_alignment. UI label for strategic_alignment is Strategic Alignment.';
COMMENT ON COLUMN public.governance_channels.portfolio IS
  'Matches projects.portfolio when scope_level = strategic_alignment. Null = org-wide SA forum.';

-- =============================================================================
-- 2) Templates (org admin)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.governance_forum_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  cadence text,
  scope_level text NOT NULL DEFAULT 'project'
    CHECK (scope_level IN ('project', 'program', 'strategic_alignment')),
  purpose text,
  audience text,
  default_chair text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, scope_level, name)
);

CREATE INDEX IF NOT EXISTS idx_gov_forum_templates_org
  ON public.governance_forum_templates (org_id, scope_level, sort_order);

DROP TRIGGER IF EXISTS trg_gov_forum_templates_updated_at ON public.governance_forum_templates;
CREATE TRIGGER trg_gov_forum_templates_updated_at
  BEFORE UPDATE ON public.governance_forum_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.governance_forum_templates TO authenticated;
GRANT ALL ON public.governance_forum_templates TO service_role;

ALTER TABLE public.governance_forum_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view forum templates" ON public.governance_forum_templates;
CREATE POLICY "Org members can view forum templates" ON public.governance_forum_templates
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "admins write forum templates" ON public.governance_forum_templates;
CREATE POLICY "admins write forum templates" ON public.governance_forum_templates
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

INSERT INTO public.governance_forum_templates (
  org_id, name, cadence, scope_level, purpose, audience, sort_order
)
SELECT o.id, x.name, x.cadence, x.scope_level, x.purpose, x.audience, x.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  ('Delivery Stand-up', 'Daily', 'project',
   'Daily blockers, commitments, and late work items.', 'Delivery squads', 10),
  ('RAID review', 'Weekly', 'project',
   'Risks, issues, actions, and decisions for this project.', 'Project team', 20),
  ('Project steering', 'Monthly', 'project',
   'Sponsor steering, decisions, and next-period plan.', 'Sponsor and PM', 30),
  ('Program Board', 'Fortnightly', 'program',
   'Program RAG, dependencies, and escalations from project forums.', 'Program & BU Leads', 10),
  ('Strategic Alignment Review', 'Monthly', 'strategic_alignment',
   'Investment health and escalations for this Strategic Alignment.', 'Executives & Sponsors', 10)
) AS x(name, cadence, scope_level, purpose, audience, sort_order)
ON CONFLICT (org_id, scope_level, name) DO NOTHING;

-- =============================================================================
-- 3) Members (resources on a forum)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.governance_forum_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.governance_channels(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('chair', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_gov_forum_members_channel
  ON public.governance_forum_members (channel_id);
CREATE INDEX IF NOT EXISTS idx_gov_forum_members_resource
  ON public.governance_forum_members (resource_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.governance_forum_members TO authenticated;
GRANT ALL ON public.governance_forum_members TO service_role;

ALTER TABLE public.governance_forum_members ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 4) Rights helpers + RLS
-- =============================================================================
CREATE OR REPLACE FUNCTION public.can_manage_governance_channel(_user_id uuid, _channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.governance_channels c
    WHERE c.id = _channel_id
      AND c.org_id = public.get_user_org(_user_id)
      AND (
        public.has_any_admin(_user_id)
        OR (
          c.scope_level = 'project'
          AND c.project_id IS NOT NULL
          AND public.can_edit_project(_user_id, c.project_id)
        )
      )
  );
$$;

COMMENT ON FUNCTION public.can_manage_governance_channel(uuid, uuid) IS
  'Org admin: any forum. Project PM / BU lead: project-scoped forums only.';

GRANT EXECUTE ON FUNCTION public.can_manage_governance_channel(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_governance_channel(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "pm insert project governance_channels" ON public.governance_channels;
CREATE POLICY "pm insert project governance_channels" ON public.governance_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND scope_level = 'project'
    AND project_id IS NOT NULL
    AND public.can_edit_project(auth.uid(), project_id)
  );

DROP POLICY IF EXISTS "pm update project governance_channels" ON public.governance_channels;
CREATE POLICY "pm update project governance_channels" ON public.governance_channels
  FOR UPDATE TO authenticated
  USING (public.can_manage_governance_channel(auth.uid(), id))
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND (
      public.has_any_admin(auth.uid())
      OR (
        scope_level = 'project'
        AND project_id IS NOT NULL
        AND public.can_edit_project(auth.uid(), project_id)
      )
    )
  );

DROP POLICY IF EXISTS "pm delete project governance_channels" ON public.governance_channels;
CREATE POLICY "pm delete project governance_channels" ON public.governance_channels
  FOR DELETE TO authenticated
  USING (
    public.can_manage_governance_channel(auth.uid(), id)
    AND scope_level = 'project'
  );

DROP POLICY IF EXISTS "Org members can view forum members" ON public.governance_forum_members;
CREATE POLICY "Org members can view forum members" ON public.governance_forum_members
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

DROP POLICY IF EXISTS "managers write forum members" ON public.governance_forum_members;
CREATE POLICY "managers write forum members" ON public.governance_forum_members
  FOR ALL TO authenticated
  USING (public.can_manage_governance_channel(auth.uid(), channel_id))
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND public.can_manage_governance_channel(auth.uid(), channel_id)
  );

-- =============================================================================
-- 5) Auto-create forums for a project (templates + shared program/SA)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.ensure_project_governance_forums(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proj public.projects%ROWTYPE;
  t RECORD;
  v_id uuid;
  v_prog uuid;
  v_sa uuid;
  v_next date;
  v_last date;
  v_cadence text;
  v_name text;
  v_purpose text;
  v_audience text;
BEGIN
  SELECT * INTO v_proj FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Shared Strategic Alignment forum (one per portfolio value, or skip if blank).
  IF coalesce(btrim(v_proj.portfolio), '') <> '' THEN
    SELECT id INTO v_sa
    FROM public.governance_channels
    WHERE org_id = v_proj.org_id
      AND scope_level = 'strategic_alignment'
      AND portfolio IS NOT DISTINCT FROM v_proj.portfolio
    ORDER BY created_at
    LIMIT 1;

    IF v_sa IS NULL THEN
      SELECT name, cadence, purpose, audience
        INTO v_name, v_cadence, v_purpose, v_audience
      FROM public.governance_forum_templates
      WHERE org_id = v_proj.org_id AND scope_level = 'strategic_alignment' AND is_active
      ORDER BY sort_order, name
      LIMIT 1;

      v_name := coalesce(v_name, 'Strategic Alignment Review');
      v_cadence := coalesce(v_cadence, 'Monthly');
      v_purpose := coalesce(v_purpose, 'Investment health and escalations for this Strategic Alignment.');
      v_audience := coalesce(v_audience, 'Executives & Sponsors');
      v_next := CURRENT_DATE + 28;
      v_last := CURRENT_DATE - 28;

      INSERT INTO public.governance_channels (
        org_id, name, cadence, audience, purpose, chair,
        last_meeting, next_meeting, status,
        scope_level, portfolio
      ) VALUES (
        v_proj.org_id, v_name, v_cadence, v_audience, v_purpose, v_proj.sponsor,
        v_last, v_next, 'Active',
        'strategic_alignment', v_proj.portfolio
      )
      RETURNING id INTO v_sa;
    END IF;
  END IF;

  -- Shared program forum (one per program name).
  IF coalesce(btrim(v_proj.program), '') <> '' THEN
    SELECT id INTO v_prog
    FROM public.governance_channels
    WHERE org_id = v_proj.org_id
      AND scope_level = 'program'
      AND program IS NOT DISTINCT FROM v_proj.program
    ORDER BY created_at
    LIMIT 1;

    IF v_prog IS NULL THEN
      SELECT name, cadence, purpose, audience
        INTO v_name, v_cadence, v_purpose, v_audience
      FROM public.governance_forum_templates
      WHERE org_id = v_proj.org_id AND scope_level = 'program' AND is_active
      ORDER BY sort_order, name
      LIMIT 1;

      v_name := coalesce(v_name, 'Program Board');
      v_cadence := coalesce(v_cadence, 'Fortnightly');
      v_purpose := coalesce(v_purpose, 'Program RAG, dependencies, and escalations from project forums.');
      v_audience := coalesce(v_audience, 'Program & BU Leads');
      v_next := CURRENT_DATE + 14;
      v_last := CURRENT_DATE - 14;

      INSERT INTO public.governance_channels (
        org_id, name, cadence, audience, purpose, chair,
        last_meeting, next_meeting, status,
        scope_level, program, parent_channel_id
      ) VALUES (
        v_proj.org_id, v_name, v_cadence, v_audience, v_purpose, v_proj.sponsor,
        v_last, v_next, 'Active',
        'program', v_proj.program, v_sa
      )
      RETURNING id INTO v_prog;
    ELSIF v_sa IS NOT NULL THEN
      UPDATE public.governance_channels
      SET parent_channel_id = v_sa
      WHERE id = v_prog AND parent_channel_id IS NULL;
    END IF;
  END IF;

  -- Project forums from active project templates.
  FOR t IN
    SELECT *
    FROM public.governance_forum_templates
    WHERE org_id = v_proj.org_id AND scope_level = 'project' AND is_active
    ORDER BY sort_order, name
  LOOP
    SELECT id INTO v_id
    FROM public.governance_channels
    WHERE project_id = v_proj.id
      AND scope_level = 'project'
      AND lower(name) = lower(t.name)
    LIMIT 1;

    IF v_id IS NULL THEN
      v_next := CURRENT_DATE + (
        CASE t.cadence
          WHEN 'Daily' THEN 1
          WHEN 'Weekly' THEN 7
          WHEN 'Fortnightly' THEN 14
          WHEN 'Monthly' THEN 28
          WHEN 'Quarterly' THEN 90
          WHEN 'Half-yearly' THEN 180
          WHEN 'Annual' THEN 365
          ELSE 7
        END
      );
      v_last := CURRENT_DATE - (
        CASE t.cadence
          WHEN 'Daily' THEN 1
          WHEN 'Weekly' THEN 7
          WHEN 'Fortnightly' THEN 14
          WHEN 'Monthly' THEN 28
          ELSE 7
        END
      );

      INSERT INTO public.governance_channels (
        org_id, name, cadence, audience, purpose, chair,
        last_meeting, next_meeting, status,
        scope_level, project_id, program, portfolio, parent_channel_id
      ) VALUES (
        v_proj.org_id, t.name, t.cadence,
        coalesce(t.audience, 'Project team'),
        t.purpose,
        coalesce(t.default_chair, v_proj.sponsor),
        v_last, v_next, 'Active',
        'project', v_proj.id, v_proj.program, v_proj.portfolio, v_prog
      )
      RETURNING id INTO v_id;
    ELSIF v_prog IS NOT NULL THEN
      UPDATE public.governance_channels
      SET parent_channel_id = v_prog
      WHERE id = v_id AND parent_channel_id IS NULL;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_project_governance_forums(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_project_governance_forums(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tg_ensure_project_governance_forums()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.program IS NOT DISTINCT FROM OLD.program
     AND NEW.portfolio IS NOT DISTINCT FROM OLD.portfolio THEN
    RETURN NEW;
  END IF;
  PERFORM public.ensure_project_governance_forums(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_ensure_governance_forums ON public.projects;
CREATE TRIGGER trg_projects_ensure_governance_forums
  AFTER INSERT OR UPDATE OF program, portfolio ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.tg_ensure_project_governance_forums();

-- Backfill existing projects (including the four e2e seed projects).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.projects ORDER BY created_at LOOP
    PERFORM public.ensure_project_governance_forums(r.id);
  END LOOP;
END $$;
