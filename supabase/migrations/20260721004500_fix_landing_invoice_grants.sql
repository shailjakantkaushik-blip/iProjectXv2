-- Fix: RLS policies alone are not enough — authenticated needs INSERT/UPDATE grants
-- for platform-admin upserts on landing_config and invoice_template_config.

GRANT SELECT, INSERT, UPDATE ON public.landing_config TO anon, authenticated;
GRANT ALL ON public.landing_config TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.invoice_template_config TO authenticated;
GRANT ALL ON public.invoice_template_config TO service_role;

-- Ensure write policies exist (safe to re-run)
DROP POLICY IF EXISTS "landing_config platform admin write" ON public.landing_config;
CREATE POLICY "landing_config platform admin write" ON public.landing_config
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "landing_config public read" ON public.landing_config;
CREATE POLICY "landing_config public read" ON public.landing_config
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "invoice_template platform admin write" ON public.invoice_template_config;
CREATE POLICY "invoice_template platform admin write" ON public.invoice_template_config
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "invoice_template authenticated read" ON public.invoice_template_config;
CREATE POLICY "invoice_template authenticated read" ON public.invoice_template_config
  FOR SELECT TO authenticated USING (true);
