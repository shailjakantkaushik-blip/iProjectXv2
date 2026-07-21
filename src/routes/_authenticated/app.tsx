import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { useLiveSync } from "@/lib/use-live-sync";
import { PageLoading } from "@/components/page-loading";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const { profile, organization, loading } = useAuth();
  const navigate = useNavigate();
  useLiveSync(organization?.id);

  // Only send users who truly have no org membership to create-org.
  // Do not treat a still-loading organization object as "needs onboarding".
  const needsOnboarding = Boolean(profile && !profile.org_id && !organization);

  useEffect(() => {
    if (!loading && needsOnboarding) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, needsOnboarding, navigate]);

  if (loading || !profile) {
    return <PageLoading label="Loading workspace…" />;
  }
  if (profile.org_id && !organization) {
    return <PageLoading label="Loading workspace…" />;
  }
  if (needsOnboarding) return null;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
