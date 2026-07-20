import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Gate,
});

function Gate() {
  const { session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (loading) return;
    if (!session) { navigate({ to: "/auth", replace: true }); return; }
    if (profile?.must_change_password && pathname !== "/force-password-change") {
      navigate({ to: "/force-password-change", replace: true });
    }
  }, [session, profile, loading, navigate, pathname]);

  if (loading || !session) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  return <Outlet />;
}
