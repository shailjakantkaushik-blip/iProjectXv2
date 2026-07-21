import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { ProjectForm, type ProjectFormValues } from "@/components/project-form";
import { toast } from "sonner";
import { useEffect } from "react";
import { PageLoading } from "@/components/page-loading";

export const Route = createFileRoute("/_authenticated/app/projects/new")({
  component: NewProject,
});

function NewProject() {
  const { organization, roles, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (roles.length === 0) return; // still hydrating
    if (!isAdmin(roles)) navigate({ to: "/app/projects", replace: true });
  }, [roles, loading, navigate]);

  if (loading || roles.length === 0) {
    return <PageLoading label="Loading…" fullScreen={false} />;
  }
  if (!isAdmin(roles)) {
    return <div className="p-8 text-sm text-muted-foreground">You need admin access to create projects.</div>;
  }

  const submit = async (values: ProjectFormValues) => {
    if (!organization) return;
    setBusy(true);
    const code = String(values.project_code ?? "").trim();
    // De-dupe by project_code within this org: update the existing row instead
    // of inserting a duplicate.
    let existingId: string | null = null;
    if (code) {
      const { data: existing } = await supabase
        .from("projects")
        .select("id")
        .eq("org_id", organization.id)
        .eq("project_code", code)
        .maybeSingle();
      existingId = (existing as { id: string } | null)?.id ?? null;
    }
    if (existingId) {
      const { error } = await supabase
        .from("projects")
        .update({ ...values, org_id: organization.id } as never)
        .eq("id", existingId);
      setBusy(false);
      if (error) return void toast.error(error.message);
      toast.success(`Project ${code} already existed — updated instead of duplicating`);
      navigate({ to: "/app/projects/$id", params: { id: existingId } });
      return;
    }
    const { data, error } = await supabase
      .from("projects")
      .insert({ ...values, org_id: organization.id } as never)
      .select("id")
      .single();
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Project created");
    navigate({ to: "/app/projects/$id", params: { id: (data as { id: string }).id } });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">New Project</h1>
      <ProjectForm onSubmit={submit} busy={busy} submitLabel="Create project" />
    </div>
  );
}
