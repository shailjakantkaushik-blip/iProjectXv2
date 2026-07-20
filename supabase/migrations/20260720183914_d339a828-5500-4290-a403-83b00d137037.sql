ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS palette JSONB NOT NULL DEFAULT '[]'::jsonb;
DROP POLICY IF EXISTS "Platform admins can update any organization branding" ON public.organizations;
CREATE POLICY "Platform admins can update any organization branding"
  ON public.organizations FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "Platform admins can view all organizations" ON public.organizations;
CREATE POLICY "Platform admins can view all organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));