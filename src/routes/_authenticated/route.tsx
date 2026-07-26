import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { readOrgAuthEntrySlug } from "@/lib/org-auth-entry";
import { getMfaStatus } from "@/lib/mfa";
import { toast } from "sonner";
import { PageLoading, SessionPending } from "@/components/page-loading";
import { AppShell } from "@/components/app-shell";
import { unlockDocumentScroll } from "@/lib/document-scroll";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  pendingComponent: SessionPending,
  component: Gate,
});

/**
 * Auth gate — best-practice scroll model:
 *
 * 1. Cold start only: block with a full-screen loader until session + MFA OK.
 * 2. After unlock: AppShell stays mounted; document scrolls (window), never a
 *    nested main scrollport or fixed overlay for soft checks.
 * 3. Soft security rechecks redirect to /mfa — they do not remount loaders.
 * 4. Org white-label membership is enforced in auth.tsx BEFORE /mfa.
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

  const goMfa = (mode: "challenge" | "enroll") => {
    navigate({
      to: "/mfa",
      search: { mode, next: pathnameRef.current || "/app" },
      replace: true,
    });
  };

  const markMfaReady = (userId: string) => {
    mfaVerifiedUserRef.current = userId;
    setMfaReady(true);
    unlockDocumentScroll();
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
        // MFA APIs unavailable — fail open (same as historical behaviour).
        if (!cancelled) markMfaReady(session.user.id);
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

  // Soft recheck: route transition only — never tear down the shell.
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

  // ── Cold gate (no shell yet) ──────────────────────────────────────────
  if (!sessionChecked || !session) {
    return <PageLoading label="Checking your session…" fullScreen />;
  }
  if (profile?.is_active === false) {
    return <PageLoading label="Account inactive…" fullScreen />;
  }
  if (!mfaReady) {
    return <PageLoading label="Verifying security…" fullScreen />;
  }

  // ── Hot path: shell stays mounted; loaders are in-flow only ───────────
  const profileMatchesSession =
    Boolean(profile) && profile!.id === session.user.id;

  if (bareShell) {
    return profileMatchesSession || !loading ? (
      <Outlet />
    ) : (
      <PageLoading label="Loading workspace…" fullScreen />
    );
  }

  return (
    <AppShell>
      {profileMatchesSession ? (
        <Outlet />
      ) : (
        <PageLoading label="Loading workspace…" />
      )}
    </AppShell>
  );
}
