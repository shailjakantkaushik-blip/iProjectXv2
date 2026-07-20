
CREATE TABLE IF NOT EXISTS public.landing_config (
  id text PRIMARY KEY DEFAULT 'singleton',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.landing_config TO anon, authenticated;
GRANT ALL ON public.landing_config TO service_role;

ALTER TABLE public.landing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "landing_config public read" ON public.landing_config
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "landing_config platform admin write" ON public.landing_config
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

INSERT INTO public.landing_config (id, config)
VALUES ('singleton', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER trg_landing_config_updated
BEFORE UPDATE ON public.landing_config
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
