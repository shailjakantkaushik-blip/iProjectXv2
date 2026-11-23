-- Public holidays by geography (resources.location) and dated resource leave.
-- Both reduce working days used by estimation load, planned FTE apply,
-- work-item demand pacing, timesheet week-plan, and utilisation.

CREATE TABLE IF NOT EXISTS public.org_public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- '*' = every location in the org. Otherwise matches resources.location
  -- case-insensitively after trim.
  location TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_public_holidays_location_present CHECK (btrim(location) <> ''),
  CONSTRAINT org_public_holidays_name_present CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_public_holidays_loc_date
  ON public.org_public_holidays (org_id, (lower(btrim(location))), holiday_date);

CREATE INDEX IF NOT EXISTS idx_org_public_holidays_org_date
  ON public.org_public_holidays (org_id, holiday_date);

COMMENT ON TABLE public.org_public_holidays IS
  'Org public holidays keyed by geography (resources.location). Location * applies to everyone.';
COMMENT ON COLUMN public.org_public_holidays.location IS
  'Geography key. * = org-wide. Otherwise matched to resources.location (trim, case-insensitive).';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_public_holidays TO authenticated;
GRANT ALL ON public.org_public_holidays TO service_role;
ALTER TABLE public.org_public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_public_holidays FORCE ROW LEVEL SECURITY;

CREATE POLICY "org read org_public_holidays" ON public.org_public_holidays
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "admins modify org_public_holidays" ON public.org_public_holidays
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

CREATE TRIGGER trg_org_public_holidays_updated
  BEFORE UPDATE ON public.org_public_holidays
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.resource_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  leave_type TEXT NOT NULL DEFAULT 'General',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT resource_leaves_dates CHECK (end_date >= start_date),
  CONSTRAINT resource_leaves_type CHECK (leave_type IN ('Annual', 'Sick', 'General'))
);

CREATE INDEX IF NOT EXISTS idx_resource_leaves_org_resource
  ON public.resource_leaves (org_id, resource_id, start_date, end_date);

COMMENT ON TABLE public.resource_leaves IS
  'Dated leave for a resource. Weekdays in the inclusive range are unavailable for capacity and estimation pacing.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_leaves TO authenticated;
GRANT ALL ON public.resource_leaves TO service_role;
ALTER TABLE public.resource_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_leaves FORCE ROW LEVEL SECURITY;

CREATE POLICY "org read resource_leaves" ON public.resource_leaves
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "admins modify resource_leaves" ON public.resource_leaves
  FOR ALL TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

CREATE TRIGGER trg_resource_leaves_updated
  BEFORE UPDATE ON public.resource_leaves
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
