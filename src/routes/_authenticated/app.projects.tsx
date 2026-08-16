import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for /app/projects/* so /new and /$id can render via Outlet.
 * /app/projects redirects to the last (or first) project workspace.
 * The portfolio register lives on Programs.
 */
export const Route = createFileRoute("/_authenticated/app/projects")({
  component: ProjectsLayout,
});

function ProjectsLayout() {
  return <Outlet />;
}
