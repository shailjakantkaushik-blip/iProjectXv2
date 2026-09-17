import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchProjectOptions, projectOptionsQueryKey } from "@/lib/project-options";
import {
  callerHasLimitedVisibility,
  filterProjectsByVisibility,
  filterStreamsByVisibility,
  visibilityConfigFromOrg,
  type VisibilityProject,
  type VisibilityStream,
} from "@/lib/project-visibility";

/** Project / program / Strategic Alignment grants from Project Access. */
export function useProjectVisibility() {
  const { user, organization, roles } = useAuth();
  const userId = user?.id;
  const cfg = useMemo(() => visibilityConfigFromOrg(organization), [organization]);
  const limited = useMemo(
    () => callerHasLimitedVisibility(cfg, userId, roles),
    [cfg, userId, roles],
  );

  const filterProjects = useCallback(
    <T extends VisibilityProject>(projects: T[], streams?: VisibilityStream[]) =>
      filterProjectsByVisibility(projects, userId, roles, cfg, streams),
    [userId, roles, cfg],
  );

  const filterStreams = useCallback(
    <T extends VisibilityStream>(streams: T[], projectsById: Map<string, VisibilityProject>) =>
      filterStreamsByVisibility(streams, projectsById, userId, roles, cfg),
    [userId, roles, cfg],
  );

  return { cfg, limited, filterProjects, filterStreams, userId };
}

/** Project picker lists — same grants as Project Access. */
export function useProjectOptions(orgId: string | null | undefined, staleTime = 15_000) {
  const { filterProjects } = useProjectVisibility();
  const q = useQuery({
    queryKey: projectOptionsQueryKey(orgId),
    queryFn: fetchProjectOptions,
    enabled: !!orgId,
    staleTime,
  });
  const data = useMemo(
    () => filterProjects((q.data ?? []) as VisibilityProject[]),
    [q.data, filterProjects],
  );
  return { ...q, data };
}

/** Scope an already-fetched project catalog to Project Access grants. */
export function useScopedProjects<T extends VisibilityProject>(rows: T[] | undefined): T[] {
  const { filterProjects } = useProjectVisibility();
  return useMemo(() => filterProjects(rows ?? []), [rows, filterProjects]);
}
