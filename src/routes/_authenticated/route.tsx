import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { readOrgAuthEntrySlug } from "@/lib/org-auth-entry";
import { getMfaStatus } from "@/lib/mfa";
import { toast } from "sonner";
import { PageLoading, SessionPending } from "@/components/page-loading";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  pendingComponent: SessionPending,
  component: Gate,
});

function Gate() {
  const { session, profile, loading, sessionChecked, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const bareShell = pathname.startsWith("/onboarding");
  /** Do not paint AppShell/Outlet until MFA is satisfied (or unavailable in project). */
  const [mfaReady, setMfaReady] = useState(false);

  useEffect(() => {
    setMfaReady(false);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!sessionChecked || loading) return;
    if (!session) {
      setMfaReady(false);
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
      void signOut();
      return;
    }
    if (profile?.must_change_password) {
      navigate({ to: "/force-password-change", replace: true });
      return;
    }

    // MFA required for every user: challenge if enrolled, otherwise force enroll.
    // Block shell render until this resolves so AAL1 sessions cannot query data.
    let cancelled = false;
    void (async () => {
      try {
        const mfa = await getMfaStatus();
        if (cancelled) return;
        if (mfa.needsChallenge) {
          navigate({
            to: "/mfa",
            search: { mode: "challenge", next: pathname || "/app" },
            replace: true,
          });
          return;
        }
        if (!mfa.hasVerifiedFactor) {
          navigate({
            to: "/mfa",
            search: { mode: "enroll", next: pathname || "/app" },
            replace: true,
          });
          return;
        }
        setMfaReady(true);
      } catch {
        /* MFA not enabled in Supabase project — skip until dashboard toggle is on */
        if (!cancelled) setMfaReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, profile, loading, sessionChecked, navigate, pathname, signOut]);

  if (!sessionChecked || loading) {
    return <PageLoading label="Checking your session…" />;
  }
  if (!session) {
    return <PageLoading label="Checking your session…" />;
  }
  if (profile?.is_active === false) {
    return <PageLoading label="Account inactive…" />;
  }
  if (!mfaReady) {
    return <PageLoading label="Verifying security…" />;
  }

  const profileMatchesSession =
    Boolean(profile) &&
    (!session || profile!.id === session.user.id);

  if (profileMatchesSession) {
    if (bareShell) return <Outlet />;
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  }

  if (bareShell) {
    return <PageLoading label="Loading workspace…" fullScreen={false} />;
  }
  return (
    <AppShell>
      <PageLoading label="Loading workspace…" fullScreen={false} />
    </AppShell>
  );
}
