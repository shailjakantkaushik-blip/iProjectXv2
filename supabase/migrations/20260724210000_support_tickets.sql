-- ============================================================
-- Support tickets: user logging + platform admin review
-- Org enablement: off / org_admin only / all users
-- ============================================================

CREATE TABLE IF NOT EXISTS public.org_support_settings (
  org_id     uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled    boolean NOT NULL DEFAULT false,
  audience   text NOT NULL DEFAULT 'org_admin'
             CHECK (audience IN ('org_admin', 'all_users')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  category    text NOT NULL DEFAULT 'General',
  priority    text NOT NULL DEFAULT 'Medium'
              CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
  status      text NOT NULL DEFAULT 'Open'
              CHECK (status IN ('Open', 'In Progress', 'Waiting on User', 'Resolved', 'Closed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_tickets_org_idx
  ON public.support_tickets (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON public.support_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_created_by_idx
  ON public.support_tickets (created_by);

CREATE TABLE IF NOT EXISTS public.support_ticket_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_comments_ticket_idx
  ON public.support_ticket_comments (ticket_id, created_at);

-- Keep ticket.updated_at fresh when comments are added
CREATE OR REPLACE FUNCTION public.tg_support_ticket_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
     SET updated_at = now()
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_comment_touch ON public.support_ticket_comments;
CREATE TRIGGER trg_support_comment_touch
  AFTER INSERT ON public.support_ticket_comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_ticket_touch();

CREATE OR REPLACE FUNCTION public.tg_support_ticket_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('Resolved', 'Closed') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.resolved_at := coalesce(NEW.resolved_at, now());
  ELSIF NEW.status NOT IN ('Resolved', 'Closed') THEN
    NEW.resolved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_ticket_updated ON public.support_tickets;
CREATE TRIGGER trg_support_ticket_updated
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_ticket_set_updated_at();

-- Can this user use Support for the given org?
CREATE OR REPLACE FUNCTION public.can_use_org_support(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled  boolean;
  v_audience text;
BEGIN
  IF p_user_id IS NULL OR p_org_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_platform_admin(p_user_id) THEN
    RETURN true;
  END IF;

  IF public.get_user_org(p_user_id) IS DISTINCT FROM p_org_id THEN
    RETURN false;
  END IF;

  SELECT s.enabled, s.audience
    INTO v_enabled, v_audience
    FROM public.org_support_settings s
   WHERE s.org_id = p_org_id;

  IF NOT FOUND OR coalesce(v_enabled, false) = false THEN
    RETURN false;
  END IF;

  IF v_audience = 'all_users' THEN
    RETURN true;
  END IF;

  -- org_admin audience
  RETURN public.has_any_admin(p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_use_org_support(uuid, uuid) TO authenticated;

ALTER TABLE public.org_support_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_comments ENABLE ROW LEVEL SECURITY;

-- ── Settings ──────────────────────────────────────────────
CREATE POLICY "org_support_settings_platform_all"
  ON public.org_support_settings FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Org members can read their own org's setting (to gate UI)
CREATE POLICY "org_support_settings_org_select"
  ON public.org_support_settings FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org(auth.uid()));

-- ── Tickets ───────────────────────────────────────────────
CREATE POLICY "support_tickets_platform_all"
  ON public.support_tickets FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "support_tickets_org_select"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (
    org_id = public.get_user_org(auth.uid())
    AND public.can_use_org_support(auth.uid(), org_id)
    AND (
      created_by = auth.uid()
      OR public.has_any_admin(auth.uid())
    )
  );

CREATE POLICY "support_tickets_org_insert"
  ON public.support_tickets FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = public.get_user_org(auth.uid())
    AND created_by = auth.uid()
    AND public.can_use_org_support(auth.uid(), org_id)
  );

-- Status / field updates are platform-admin only (platform_all policy).
-- Org users reply via support_ticket_comments.

-- ── Comments ──────────────────────────────────────────────
CREATE POLICY "support_comments_platform_all"
  ON public.support_ticket_comments FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "support_comments_org_select"
  ON public.support_ticket_comments FOR SELECT
  TO authenticated
  USING (
    is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.org_id = public.get_user_org(auth.uid())
        AND public.can_use_org_support(auth.uid(), t.org_id)
        AND (
          t.created_by = auth.uid()
          OR public.has_any_admin(auth.uid())
        )
    )
  );

CREATE POLICY "support_comments_org_insert"
  ON public.support_ticket_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_internal = false
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id
        AND t.org_id = public.get_user_org(auth.uid())
        AND public.can_use_org_support(auth.uid(), t.org_id)
        AND t.status NOT IN ('Closed')
        AND (
          t.created_by = auth.uid()
          OR public.has_any_admin(auth.uid())
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.org_support_settings TO authenticated;
GRANT ALL ON public.org_support_settings TO service_role;

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

GRANT SELECT, INSERT ON public.support_ticket_comments TO authenticated;
GRANT ALL ON public.support_ticket_comments TO service_role;

-- Notify ticket creator when platform adds a public comment or status changes.
-- Implemented in app for simplicity; DB trigger optional later.

COMMENT ON TABLE public.org_support_settings IS
  'Platform-admin toggle: enable Support for org_admin only or all users in an organisation.';
COMMENT ON TABLE public.support_tickets IS
  'Support tickets logged by organisation users; reviewed by platform admins.';
COMMENT ON TABLE public.support_ticket_comments IS
  'Threaded comments on support tickets. is_internal=true is platform-only.';
