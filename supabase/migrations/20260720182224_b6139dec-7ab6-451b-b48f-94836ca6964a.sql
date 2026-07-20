ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_admin';

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::text = 'platform_admin')
$$;

CREATE TABLE public.billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  interval text NOT NULL DEFAULT 'month',
  max_users integer,
  max_projects integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  stripe_price_id text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.billing_plans TO anon, authenticated;
GRANT ALL ON public.billing_plans TO service_role;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans readable by all" ON public.billing_plans FOR SELECT USING (true);
CREATE POLICY "plans manage platform" ON public.billing_plans FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.billing_plans FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.billing_plans(id),
  status text NOT NULL DEFAULT 'active',
  current_period_start date,
  current_period_end date,
  stripe_customer_id text,
  stripe_subscription_id text,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub view own or platform" ON public.subscriptions FOR SELECT
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "sub manage platform" ON public.subscriptions FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_subs_org ON public.subscriptions(org_id);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  paid_date date,
  period_start date,
  period_end date,
  stripe_invoice_id text,
  stripe_hosted_url text,
  notes text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv view own or platform" ON public.invoices FOR SELECT
  USING (org_id = public.get_user_org(auth.uid()) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "inv manage platform" ON public.invoices FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_inv_updated BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_invoices_org ON public.invoices(org_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);

CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  paid_at timestamptz NOT NULL DEFAULT now(),
  method text,
  stripe_payment_intent_id text,
  reference text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.invoice_payments TO authenticated;
GRANT ALL ON public.invoice_payments TO service_role;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay view own or platform" ON public.invoice_payments FOR SELECT
  USING (public.is_platform_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.org_id = public.get_user_org(auth.uid())
  ));
CREATE POLICY "pay insert platform" ON public.invoice_payments FOR INSERT
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE TABLE public.platform_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  description text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  vendor text,
  recurring boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_expenses TO authenticated;
GRANT ALL ON public.platform_expenses TO service_role;
ALTER TABLE public.platform_expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "expenses platform only" ON public.platform_expenses FOR ALL
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE TRIGGER trg_exp_updated BEFORE UPDATE ON public.platform_expenses FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif own" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notif own update" ON public.notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "notif insert platform or self" ON public.notifications FOR INSERT
  WITH CHECK (public.is_platform_admin(auth.uid()) OR user_id = auth.uid());
CREATE INDEX idx_notif_user ON public.notifications(user_id, read_at);

CREATE OR REPLACE FUNCTION public.tg_invoice_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_user uuid;
  kind_txt text;
  title_txt text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'paid' THEN kind_txt := 'invoice_paid'; title_txt := 'Invoice ' || NEW.invoice_number || ' marked as paid';
  ELSIF NEW.status = 'sent' THEN kind_txt := 'invoice_sent'; title_txt := 'New invoice ' || NEW.invoice_number || ' issued';
  ELSIF NEW.status = 'overdue' THEN kind_txt := 'invoice_overdue'; title_txt := 'Invoice ' || NEW.invoice_number || ' is overdue';
  ELSE RETURN NEW;
  END IF;
  FOR admin_user IN
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.org_id = NEW.org_id AND ur.role::text IN ('org_admin','admin')
  LOOP
    INSERT INTO public.notifications (user_id, org_id, kind, title, body, link)
    VALUES (admin_user, NEW.org_id, kind_txt, title_txt,
      'Amount: ' || (NEW.amount_cents/100.0)::text || ' ' || NEW.currency, '/app/billing');
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_invoice_notify AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_notify();

INSERT INTO public.billing_plans (code, name, description, price_cents, interval, max_users, max_projects, features, sort_order) VALUES
  ('free', 'Free', 'Get started', 0, 'month', 3, 5, '["Up to 5 projects","1 admin","Community support"]'::jsonb, 1),
  ('team', 'Team', 'Growing teams', 4900, 'month', 10, NULL, '["Unlimited projects","10 users","Email support"]'::jsonb, 2),
  ('business', 'Business', 'Enterprise-ready', 19900, 'month', NULL, NULL, '["Unlimited users","SSO","Priority support"]'::jsonb, 3);
