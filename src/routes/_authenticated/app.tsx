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
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4">
        <div
          className="h-9 w-9 animate-pulse rounded-lg"
          style={{ background: "var(--primary)" }}
        />
        <div className="text-sm font-medium text-foreground">Loading workspace…</div>
        <div className="text-xs text-muted-foreground">Preparing your portfolio cockpit</div>
      </div>
    );
  }
  if (!organization) return null;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
