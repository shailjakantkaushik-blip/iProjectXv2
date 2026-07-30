import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth, isAdmin } from "@/lib/auth-context";
import { PageLoading } from "@/components/page-loading";
import { ProjectCreateWizard } from "@/components/project-create-wizard";

export const Route = createFileRoute("/_authenticated/app/projects/new")({
  component: NewProject,
});

function NewProject() {
  const { roles, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (roles.length === 0) return;
    if (!isAdmin(roles)) navigate({ to: "/app/projects", replace: true });
  }, [roles, loading, navigate]);

  if (loading || roles.length === 0) {
    return <PageLoading label="Loading…" fullScreen={false} />;
  }
  if (!isAdmin(roles)) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        You need admin access to create projects.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-1">
        <Link to="/app/projects" className="text-xs text-sky-700 hover:underline">
          ← Back to projects
        </Link>
        <Link to="/app/data-editor" className="text-xs text-muted-foreground hover:underline">
          Prefer bulk Excel? Open Data Editor
        </Link>
      </div>
      <ProjectCreateWizard />
    </div>
  );
}
