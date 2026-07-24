import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { readOrgAuthEntrySlug } from "@/lib/org-auth-entry";
import { toast } from "sonner";
import { PageLoading } from "@/components/page-loading";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Gate,
});

function Gate() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (loading) return;
    if (!session) {
      const slug = readOrgAuthEntrySlug();
      if (slug) {
        void navigate({ to: "/auth", search: { org: slug }, replace: true });
      } else {
        void navigate({ to: "/auth", replace: true });
      }
      return;
    }
    if (profile && profile.is_active === false) {
      toast.error("Your account is inactive. Contact your administrator.");
      // signOut redirects to the org auth link when that is how they entered.
      void signOut();
      return;
    }
    if (profile?.must_change_password && pathname !== "/force-password-change") {
      navigate({ to: "/force-password-change", replace: true });
    }
  }, [session, profile, loading, navigate, pathname, signOut]);

  // Prefer staying mounted when we already have a matching profile. Tab-focus
  // session recovery must not tear down the whole authenticated shell.
  if (!session || !profile || profile.id !== session.user.id) {
    return <PageLoading label="Checking your session…" />;
  }
  if (profile.is_active === false) {
    return <PageLoading label="Account inactive…" />;
  }
  return <Outlet />;
}
