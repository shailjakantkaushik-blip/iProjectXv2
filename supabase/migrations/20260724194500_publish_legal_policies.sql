-- Publish seeded legal policies so landing /legal/:slug links work.
UPDATE public.legal_policies
SET published = true,
    updated_at = now()
WHERE published = false;
