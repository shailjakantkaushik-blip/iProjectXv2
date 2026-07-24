-- Grants missing from EOI / licenses / legal_policies tables.
-- Without these, PostgREST returns "permission denied for table …"
-- even when RLS policies exist.

GRANT SELECT, INSERT, UPDATE ON public.eoi_requests TO authenticated;
GRANT INSERT ON public.eoi_requests TO anon;
GRANT ALL ON public.eoi_requests TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_license_certificates TO authenticated;
GRANT ALL ON public.org_license_certificates TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_policies TO authenticated;
GRANT SELECT ON public.legal_policies TO anon;
GRANT ALL ON public.legal_policies TO service_role;
