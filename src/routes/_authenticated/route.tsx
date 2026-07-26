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
 * Security invariants:
 * 1. No AppShell/Outlet until MFA enroll + AAL2 (or MFA APIs unavailable).
 * 2. Org white-label membership is enforced in auth.tsx BEFORE /mfa.
 * 3. After MFA is ready, never swap the shell for a full-screen loader on soft
 *    re-checks — that froze page scrolling. Soft re-check only navigates to /mfa.
 */
function Gate() {
  const { session, profile, loading, sessionChecked, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const bareShell = pathname.startsWith("/onboarding");

  const mfaVerifiedUserRef = useRef<string | null>(null);
  /** Once true for this mount, never swap AppShell for a full-screen loader. */
  const shellUnlockedRef = useRef(false);
  const [mfaReady, setMfaReady] = useState(false);

  const goMfa = (mode: "challenge" | "enroll") => {
    navigate({
      to: "/mfa",
      search: { mode, next: pathnameRef.current || "/app" },
      replace: true,
    });
  };

  const markMfaReady = (userId: string) => {
    mfaVerifiedUserRef.current = userId;
    shellUnlockedRef.current = true;
    setMfaReady(true);
  };

  useEffect(() => {
    if (!sessionChecked) return;

    if (!session) {
      mfaVerifiedUserRef.current = null;
      shellUnlockedRef.current = false;
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

    if (mfaVerifiedUserRef.current === session.user.id) {
      if (!mfaReady) markMfaReady(session.user.id);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const mfa = await getMfaStatus();
        if (cancelled) return;
        if (mfa.needsChallenge || mfa.currentLevel === "aal1") {
          goMfa("challenge");
          return;
        }
        if (!mfa.hasVerifiedFactor) {
          goMfa("enroll");
          return;
        }
        markMfaReady(session.user.id);
      } catch {
        if (!cancelled) {
          markMfaReady(session.user.id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    session,
    sessionChecked,
    profile?.is_active,
    profile?.must_change_password,
    navigate,
    signOut,
    mfaReady,
  ]);

  // Soft re-check on tab focus. Navigate to /mfa if needed — do NOT set
  // mfaReady=false (that mounted a fixed full-screen loader and killed scroll).
  useEffect(() => {
    if (!mfaReady || !session) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void getMfaStatus()
        .then((mfa) => {
          if (mfa.needsChallenge || mfa.currentLevel === "aal1") {
            mfaVerifiedUserRef.current = null;
            goMfa("challenge");
            return;
          }
          if (!mfa.hasVerifiedFactor) {
            mfaVerifiedUserRef.current = null;
            goMfa("enroll");
          }
        })
        .catch(() => {});
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
  // Keep shell mounted after first unlock — full-screen loader freezes scroll.
  if (!mfaReady && !shellUnlockedRef.current) {
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
