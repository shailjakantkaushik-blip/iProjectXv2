import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const bareShell = pathname.startsWith("/onboarding");

  /**
   * MFA is checked once per authenticated user session — not on every route
   * change. Re-running getMfaStatus() + flipping mfaReady on pathname was
   * remounting AppShell and making scroll/nav feel janky after the security fix.
   */
  const mfaVerifiedUserRef = useRef<string | null>(null);
  const [mfaReady, setMfaReady] = useState(false);

  useEffect(() => {
    if (!sessionChecked) return;

    if (!session) {
      mfaVerifiedUserRef.current = null;
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

    // Already cleared MFA for this user — keep shell mounted across navigations.
    if (mfaVerifiedUserRef.current === session.user.id) {
      if (!mfaReady) setMfaReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const mfa = await getMfaStatus();
        if (cancelled) return;
        const next = pathnameRef.current || "/app";
        if (mfa.needsChallenge) {
          navigate({
            to: "/mfa",
            search: { mode: "challenge", next },
            replace: true,
          });
          return;
        }
        if (!mfa.hasVerifiedFactor) {
          navigate({
            to: "/mfa",
            search: { mode: "enroll", next },
            replace: true,
          });
          return;
        }
        mfaVerifiedUserRef.current = session.user.id;
        setMfaReady(true);
      } catch {
        /* MFA APIs unavailable in project — allow through (same as before). */
        if (!cancelled) {
          mfaVerifiedUserRef.current = session.user.id;
          setMfaReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit pathname/loading — re-check only on session/profile security fields.
  }, [
    session,
    sessionChecked,
    profile?.is_active,
    profile?.must_change_password,
    navigate,
    signOut,
    mfaReady,
  ]);

  // Cold auth only — never tear down the shell after MFA has passed (quiet hydrate).
  if (!sessionChecked) {
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
    Boolean(profile) && profile!.id === session.user.id;

  if (bareShell) {
    return profileMatchesSession || !loading ? <Outlet /> : <PageLoading label="Loading workspace…" />;
  }

  // Keep AppShell mounted across route changes and soft profile hydrates.
  return (
    <AppShell>
      {profileMatchesSession ? (
        <Outlet />
      ) : (
        <PageLoading label="Loading workspace…" fullScreen={false} />
      )}
    </AppShell>
  );
}
