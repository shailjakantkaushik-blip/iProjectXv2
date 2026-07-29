import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLiveSync } from "@/lib/use-live-sync";
import { usePageAccessGuard } from "@/lib/page-access-guard";
import { PageLoading } from "@/components/page-loading";
import { AppPageDownload } from "@/components/app-page-download";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppLayout,
});

function AppLayout() {
  const { profile, organization, loading, sessionChecked, refresh } = useAuth();
  const navigate = useNavigate();
  useLiveSync(organization?.id);
  // Enforce org page ACL on direct URLs (nav already filters links).
  usePageAccessGuard();
  const [orgWaitMs, setOrgWaitMs] = useState(0);

  const needsOnboarding = Boolean(
    sessionChecked && !loading && profile && !profile.org_id && !organization,
  );

  useEffect(() => {
    if (needsOnboarding) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [needsOnboarding, navigate]);

  // If profile has org_id but org chrome never arrives, don't spin forever.
  const waitingOnOrg = Boolean(profile?.org_id && !organization);
  useEffect(() => {
    if (!waitingOnOrg) {
      setOrgWaitMs(0);
      return;
    }
    const started = Date.now();
    const tick = window.setInterval(() => setOrgWaitMs(Date.now() - started), 500);
    const retry = window.setTimeout(() => {
      void refresh();
    }, 2500);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(retry);
    };
  }, [waitingOnOrg, profile?.org_id, refresh]);

  // Never cover the shell with a full-screen loader when we already have chrome.
  // Other fast SaaS apps paint the frame first; content fills in after.
  if (!profile) {
    if (!loading && sessionChecked) {
      return (
        <div className="mx-auto max-w-md py-16 text-center space-y-3">
          <p className="text-sm font-semibold">Couldn’t load your profile</p>
          <p className="text-xs text-muted-foreground">
            Try refreshing. If this continues after a database change, reload the Supabase API
            schema cache (Project Settings → API → Reload schema).
          </p>
          <button type="button" className="st-btn-primary" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      );
    }
    return <PageLoading label="Loading workspace…" fullScreen={false} />;
  }
  if (waitingOnOrg) {
    if (orgWaitMs > 8000) {
      return (
        <div className="mx-auto max-w-md py-16 text-center space-y-3">
          <p className="text-sm font-semibold">Workspace is taking too long</p>
          <p className="text-xs text-muted-foreground">
            Your profile loaded, but the organization record did not. After running SQL in
            Supabase, open <strong>Project Settings → API → Reload schema</strong>, then retry.
          </p>
          <button type="button" className="st-btn-primary" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      );
    }
    return <PageLoading label="Loading workspace…" fullScreen={false} />;
  }
  if (needsOnboarding) return null;

  // Bottom Download page — gated by org/platform page_download config.
  return (
    <AppPageDownload>
      <Outlet />
    </AppPageDownload>
  );
}
