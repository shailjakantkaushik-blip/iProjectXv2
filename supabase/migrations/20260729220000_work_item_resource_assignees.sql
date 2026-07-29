-- Work item assignees: assign resources (not login users).
-- Timesheet placeholders resolve via resources.user_id → current login.

-- 1) Add resource_id
ALTER TABLE public.work_item_assignees
  ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.resources(id) ON DELETE CASCADE;

-- 2) Backfill from linked resources
UPDATE public.work_item_assignees a
SET resource_id = r.id
FROM public.resources r
WHERE a.resource_id IS NULL
  AND r.org_id = a.org_id
  AND r.user_id IS NOT NULL
  AND a.user_id = r.user_id;

-- 3) Drop rows that cannot be mapped to a resource
DELETE FROM public.work_item_assignees WHERE resource_id IS NULL;

-- 4) Enforce resource_id uniqueness; relax/drop user_id requirement
ALTER TABLE public.work_item_assignees
  ALTER COLUMN resource_id SET NOT NULL;

ALTER TABLE public.work_item_assignees
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.work_item_assignees
  DROP CONSTRAINT IF EXISTS work_item_assignees_work_item_id_user_id_key;

DROP INDEX IF EXISTS public.work_item_assignees_work_item_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_item_assignees_resource
  ON public.work_item_assignees (work_item_id, resource_id);

CREATE INDEX IF NOT EXISTS idx_work_item_assignees_resource
  ON public.work_item_assignees (resource_id);

-- Keep user_id denormalised from resource for convenience (nullable)
UPDATE public.work_item_assignees a
SET user_id = r.user_id
FROM public.resources r
WHERE r.id = a.resource_id
  AND a.user_id IS DISTINCT FROM r.user_id;

-- 5) Owner trigger: map owner_user_id → their linked resource
CREATE OR REPLACE FUNCTION public.tg_work_item_owner_assignee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rid uuid;
BEGIN
  IF NEW.owner_user_id IS NOT NULL THEN
    SELECT r.id INTO rid
    FROM public.resources r
    WHERE r.org_id = NEW.org_id AND r.user_id = NEW.owner_user_id
    LIMIT 1;

    IF rid IS NOT NULL THEN
      INSERT INTO public.work_item_assignees (org_id, work_item_id, resource_id, user_id)
      VALUES (NEW.org_id, NEW.id, rid, NEW.owner_user_id)
      ON CONFLICT (work_item_id, resource_id) DO UPDATE
        SET user_id = EXCLUDED.user_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_work_item_owner_assignee ON public.work_items;
CREATE TRIGGER trg_work_item_owner_assignee
  AFTER INSERT OR UPDATE OF owner_user_id
  ON public.work_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_work_item_owner_assignee();

-- ON CONFLICT for unique index needs constraint name — use index inference:
-- Postgres ON CONFLICT (work_item_id, resource_id) works with unique index.

COMMENT ON TABLE public.work_item_assignees IS
  'Work-item team: resources assigned to the item. Timesheets use resources.user_id.';
COMMENT ON COLUMN public.work_item_assignees.resource_id IS
  'Assigned delivery resource (not the login).';
COMMENT ON COLUMN public.work_item_assignees.user_id IS
  'Optional denormalised login from resources.user_id when linked.';
