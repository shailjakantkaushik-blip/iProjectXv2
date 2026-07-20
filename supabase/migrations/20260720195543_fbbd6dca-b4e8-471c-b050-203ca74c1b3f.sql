
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS billing_email text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS email_last_error text;

CREATE OR REPLACE FUNCTION public.generate_due_invoices()
RETURNS TABLE(invoice_id uuid, org_id uuid, amount_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub RECORD;
  new_period_start date;
  new_period_end date;
  new_invoice_id uuid;
  invoice_num text;
BEGIN
  FOR sub IN
    SELECT s.*, bp.price_cents, bp.currency, bp.interval, bp.name AS plan_name
    FROM public.subscriptions s
    JOIN public.billing_plans bp ON bp.id = s.plan_id
    WHERE s.status IN ('active','trialing','past_due')
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end <= CURRENT_DATE
      AND COALESCE(bp.price_cents,0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.subscription_id = s.id
          AND i.period_start = s.current_period_end
      )
  LOOP
    new_period_start := sub.current_period_end;
    new_period_end := CASE sub.interval
      WHEN 'month' THEN new_period_start + INTERVAL '1 month'
      WHEN 'year'  THEN new_period_start + INTERVAL '1 year'
      WHEN 'week'  THEN new_period_start + INTERVAL '1 week'
      ELSE new_period_start + INTERVAL '1 month'
    END;

    invoice_num := 'INV-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,6);

    INSERT INTO public.invoices
      (org_id, subscription_id, invoice_number, amount_cents, currency, status,
       issue_date, due_date, period_start, period_end, notes)
    VALUES
      (sub.org_id, sub.id, invoice_num, sub.price_cents, COALESCE(sub.currency,'USD'), 'sent',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '14 day', new_period_start, new_period_end,
       sub.plan_name || ' subscription — ' || new_period_start::text || ' to ' || new_period_end::text)
    RETURNING id INTO new_invoice_id;

    UPDATE public.subscriptions
       SET current_period_start = new_period_start,
           current_period_end = new_period_end,
           updated_at = now()
     WHERE id = sub.id;

    invoice_id := new_invoice_id; org_id := sub.org_id; amount_cents := sub.price_cents;
    RETURN NEXT;
  END LOOP;

  UPDATE public.invoices
     SET status = 'overdue'
   WHERE status = 'sent' AND due_date < CURRENT_DATE;
END $$;

GRANT EXECUTE ON FUNCTION public.generate_due_invoices() TO service_role;
