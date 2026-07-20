import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated/platform")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
    const isPlatform = (roles ?? []).some((r: any) => r.role === "platform_admin");
    if (!isPlatform) throw redirect({ to: "/app" });
  },
  component: () => <AppShell><Outlet /></AppShell>,
});
