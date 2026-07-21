import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Gate,
});

function Gate() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    if (profile && profile.is_active === false) {
      toast.error("Your account is inactive. Contact your administrator.");
      void signOut().then(() => navigate({ to: "/auth", replace: true }));
      return;
    }
    if (profile?.must_change_password && pathname !== "/force-password-change") {
      navigate({ to: "/force-password-change", replace: true });
    }
  }, [session, profile, loading, navigate, pathname, signOut]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (profile && profile.is_active === false) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Account inactive…
      </div>
    );
  }
  return <Outlet />;
}
