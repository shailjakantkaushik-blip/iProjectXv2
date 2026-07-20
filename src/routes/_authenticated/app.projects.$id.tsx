import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { ProjectForm, type ProjectFormValues } from "@/components/project-form";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/projects/$id")({
  component: ProjectDetail,
});

function ProjectDetail() {
  const { id } = Route.useParams();
  const { roles } = useAuth();
  const admin = isAdmin(roles);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const submit = async (values: ProjectFormValues) => {
    setBusy(true);
    const { error } = await supabase.from("projects").update(values as never).eq("id", id);
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["project", id] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const remove = async () => {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    navigate({ to: "/app/projects" });
  };

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!project) return <div className="text-sm text-muted-foreground">Project not found or you don't have access.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-mono text-muted-foreground">{project.project_code || project.id.slice(0,8)}</div>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
        </div>
        {admin && (
          <Button variant="destructive" size="sm" onClick={remove}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
        )}
      </div>
      <ProjectForm defaultValues={project as unknown as Partial<ProjectFormValues>} onSubmit={submit} busy={busy} submitLabel="Save changes" />
    </div>
  );
}
