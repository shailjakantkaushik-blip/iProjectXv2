
CREATE TABLE public.governance_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cadence TEXT,
  audience TEXT,
  purpose TEXT,
  chair TEXT,
  next_meeting DATE,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.governance_channels TO authenticated;
GRANT ALL ON public.governance_channels TO service_role;

ALTER TABLE public.governance_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view channels" ON public.governance_channels
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "Org members can insert channels" ON public.governance_channels
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "Org members can update channels" ON public.governance_channels
  FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org(auth.uid()))
  WITH CHECK (org_id = public.get_user_org(auth.uid()));

CREATE POLICY "Org admins can delete channels" ON public.governance_channels
  FOR DELETE TO authenticated
  USING (org_id = public.get_user_org(auth.uid()) AND public.has_any_admin(auth.uid()));

CREATE TRIGGER trg_governance_channels_updated_at
  BEFORE UPDATE ON public.governance_channels
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed default channels for existing orgs
INSERT INTO public.governance_channels (org_id, name, cadence, audience, purpose)
SELECT o.id, x.name, x.cadence, x.audience, x.purpose
FROM public.organizations o
CROSS JOIN (VALUES
  ('Portfolio Steering Committee','Monthly','Executives & Sponsors','Approve investments, review portfolio health'),
  ('Program Board','Fortnightly','Program & BU Leads','Program-level RAG, dependencies, escalations'),
  ('Project Review Forum','Weekly','Project Managers','Milestones, risks, actions'),
  ('Change Advisory Board','Weekly','CAB Members','Assess and approve change requests'),
  ('Architecture Review','Bi-weekly','Architects & Tech Leads','Solution design, standards, non-functional review'),
  ('Benefits Realisation Review','Quarterly','Sponsors & Finance','Track benefits vs target post go-live')
) AS x(name,cadence,audience,purpose);
