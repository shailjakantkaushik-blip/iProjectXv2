import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth, canEditProjects } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/streamlit";
import { PageLoading } from "@/components/page-loading";
import {
  fetchProjectOptions,
  pickDefaultProjectId,
  projectOptionsQueryKey,
} from "@/lib/project-options";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/projects/")({
  component: ProjectsIndexRedirect,
});

/** Nav /app/projects opens a project workspace (same page as Executive Dashboard). */
function ProjectsIndexRedirect() {
  const { organization, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const canEdit = canEditProjects(roles);
  const orgId = organization?.id;

  const {
    data: projects = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
    retry: 2,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!orgId || isLoading) return;
    const next = pickDefaultProjectId(projects as { id: string }[], orgId);
    if (!next) return;
    navigate({ to: "/app/projects/$id", params: { id: next }, replace: true });
  }, [orgId, isLoading, projects, navigate]);

  if (authLoading || !orgId || isLoading) {
    return <PageLoading label="Loading projects…" />;
  }
  if (isError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Could not load projects{error instanceof Error ? `: ${error.message}` : "."}
        </p>
        <Button size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Retrying…" : "Try again"}
        </Button>
      </div>
    );
  }
  if (projects.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeading
          icon="📁"
          title="Projects"
          subtitle="Open a project workspace from the list, or create the first one."
        />
        <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
          <p>No projects in this organisation yet.</p>
          {canEdit ? (
            <Button asChild size="sm" className="mt-4">
              <Link to="/app/projects/new">
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Link>
            </Button>
          ) : (
            <p className="mt-2">Ask an admin to add a project.</p>
          )}
        </div>
      </div>
    );
  }

  return <PageLoading label="Opening project…" />;
}
