import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for /app/projects/* so /new and /$id can render via Outlet.
 * List UI lives in app.projects.index.tsx.
 */
export const Route = createFileRoute("/_authenticated/app/projects")({
  component: ProjectsLayout,
});

function ProjectsLayout() {
  return <Outlet />;
}
