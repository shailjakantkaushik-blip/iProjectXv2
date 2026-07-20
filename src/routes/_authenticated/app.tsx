import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/app-shell";
import { useLiveSync } from "@/lib/use-live-sync";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const { profile, organization, loading } = useAuth();
  const navigate = useNavigate();
  useLiveSync(organization?.id);

  useEffect(() => {
    if (!loading && profile && !organization) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [profile, organization, loading, navigate]);

  if (loading || !profile) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!organization) return null;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
