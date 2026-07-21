-- Fix user_roles uniqueness for org-level roles (bu_id IS NULL).
-- The original UNIQUE (user_id, org_id, role, bu_id) does not reliably
-- dedupe rows when bu_id is NULL, and app upserts that used ON CONFLICT
-- (user_id, role) failed because no such constraint exists.

-- Remove duplicate org-level role rows (keep earliest)
DELETE FROM public.user_roles a
USING public.user_roles b
WHERE a.bu_id IS NULL
  AND b.bu_id IS NULL
  AND a.user_id = b.user_id
  AND a.org_id = b.org_id
  AND a.role = b.role
  AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_org_role_null_bu_uidx
  ON public.user_roles (user_id, org_id, role)
  WHERE bu_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_org_role_bu_uidx
  ON public.user_roles (user_id, org_id, role, bu_id)
  WHERE bu_id IS NOT NULL;
