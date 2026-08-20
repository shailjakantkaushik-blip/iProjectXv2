import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for /app/projects/* so the index list, /new, and /$id render via Outlet.
 */
export const Route = createFileRoute("/_authenticated/app/projects")({
  component: ProjectsLayout,
});

function ProjectsLayout() {
  return <Outlet />;
}
