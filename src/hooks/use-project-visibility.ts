import { useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
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
