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

/**
 * Security invariants (must not regress for scroll/perf work):
 * 1. No AppShell/Outlet until MFA enroll+AAL2 is satisfied (or MFA APIs unavailable).
 * 2. Org white-label membership is enforced in auth.tsx BEFORE /mfa redirect.
 * 3. Scroll/nav smoothness: do NOT remount AppShell on every pathname or quiet
 *    profile hydrate — re-check MFA without tearing the shell down.
 */
function Gate() {
  const { session, profile, loading, sessionChecked, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const bareShell = pathname.startsWith("/onboarding");

  const mfaVerifiedUserRef = useRef<string | null>(null);
  const [mfaReady, setMfaReady] = useState(false);

  const redirectToMfa = (mode: "challenge" | "enroll") => {
    navigate({
      to: "/mfa",
      search: { mode, next: pathnameRef.current || "/app" },
      replace: true,
    });
  };

  /** Returns true if the session may enter the app. */
  const evaluateMfa = async (): Promise<"ok" | "redirect"> => {
    const mfa = await getMfaStatus();
    if (mfa.needsChallenge) {
      redirectToMfa("challenge");
      return "redirect";
    }
    if (!mfa.hasVerifiedFactor) {
      redirectToMfa("enroll");
      return "redirect";
    }
    // Defense-in-depth: enrolled but still on password-only assurance.
    if (mfa.currentLevel === "aal1") {
      redirectToMfa("challenge");
      return "redirect";
    }
    return "ok";
  };

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

    // Already verified for this user in this Gate mount — do not re-flip state
    // (avoids shell remount / scroll jank). Soft recheck is on visibility below.
    if (mfaVerifiedUserRef.current === session.user.id) {
      if (!mfaReady) setMfaReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const result = await evaluateMfa();
        if (cancelled || result !== "ok") return;
        mfaVerifiedUserRef.current = session.user.id;
        setMfaReady(true);
      } catch {
        /* MFA APIs unavailable in Supabase project — same fail-open as before. */
        if (!cancelled) {
          mfaVerifiedUserRef.current = session.user.id;
          setMfaReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pathname via ref; loading omitted on purpose
  }, [
    session,
    sessionChecked,
    profile?.is_active,
    profile?.must_change_password,
    navigate,
    signOut,
    mfaReady,
  ]);

  // Soft security re-check when the tab becomes visible again — redirect to MFA
  // if assurance dropped, without unmounting the shell first (no scroll jank).
  useEffect(() => {
    if (!mfaReady || !session) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void evaluateMfa()
        .then((result) => {
          if (result === "redirect") {
            mfaVerifiedUserRef.current = null;
            setMfaReady(false);
          }
        })
        .catch(() => {
          /* ignore transient MFA API errors on soft recheck */
        });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mfaReady, session?.user?.id, navigate]);

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
    return profileMatchesSession || !loading ? (
      <Outlet />
    ) : (
      <PageLoading label="Loading workspace…" />
    );
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
