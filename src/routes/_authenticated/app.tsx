import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLiveSync } from "@/lib/use-live-sync";
import { PageLoading } from "@/components/page-loading";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const { profile, organization, loading, sessionChecked } = useAuth();
  const navigate = useNavigate();
  useLiveSync(organization?.id);

  const needsOnboarding = Boolean(
    sessionChecked && !loading && profile && !profile.org_id && !organization,
  );

  useEffect(() => {
    if (needsOnboarding) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [needsOnboarding, navigate]);

  // Never cover the shell with a full-screen loader when we already have chrome.
  // Other fast SaaS apps paint the frame first; content fills in after.
  if (!profile) {
    return <PageLoading label="Loading workspace…" fullScreen={false} />;
  }
  if (profile.org_id && !organization) {
    return <PageLoading label="Loading workspace…" fullScreen={false} />;
  }
  if (needsOnboarding) return null;

  return <Outlet />;
}
