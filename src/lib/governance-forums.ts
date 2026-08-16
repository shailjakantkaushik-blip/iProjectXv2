/** Governance forum scope: project, program, or Strategic Alignment (DB key `portfolio`). */

export const GOVERNANCE_SCOPE_LEVELS = ["project", "program", "strategic_alignment"] as const;
export type GovernanceScopeLevel = (typeof GOVERNANCE_SCOPE_LEVELS)[number];

export const GOVERNANCE_SCOPE_LABEL: Record<GovernanceScopeLevel, string> = {
  project: "Project",
  program: "Program",
  strategic_alignment: "Strategic Alignment",
};

export function scopeLabel(level: string | null | undefined) {
  if (level === "project" || level === "program" || level === "strategic_alignment") {
    return GOVERNANCE_SCOPE_LABEL[level];
  }
  return "Strategic Alignment";
}

export type GovernanceChannel = {
  id: string;
  org_id: string;
  name: string;
  cadence: string | null;
  audience: string | null;
  purpose: string | null;
  chair: string | null;
  next_meeting: string | null;
  last_meeting: string | null;
  parent_channel_id: string | null;
  status: string | null;
  scope_level?: string | null;
  project_id?: string | null;
  program?: string | null;
  portfolio?: string | null;
};

export type GovernanceProject = {
  id: string;
  name: string;
  project_code?: string | null;
  program?: string | null;
  portfolio?: string | null;
  pm_user_id?: string | null;
};

export type GovernanceStream = {
  id: string;
  project_id: string;
  name: string;
};

export const GOVERNANCE_CHANNELS_SELECT = [
  "id",
  "org_id",
  "name",
  "cadence",
  "audience",
  "purpose",
  "chair",
  "next_meeting",
  "last_meeting",
  "parent_channel_id",
  "status",
  "scope_level",
  "project_id",
  "program",
  "portfolio",
].join(",");

export const GOVERNANCE_CHANNELS_SELECT_MIN = [
  "id",
  "org_id",
  "name",
  "cadence",
  "audience",
  "purpose",
  "chair",
  "next_meeting",
  "last_meeting",
  "parent_channel_id",
  "status",
].join(",");

export function isMissingGovernanceScopeColumn(error: { message?: string } | null | undefined) {
  const msg = String(error?.message || "");
  return /scope_level/i.test(msg) || /Could not find the 'scope_level'/i.test(msg);
}

export function normalizeChannel(row: GovernanceChannel): GovernanceChannel {
  return {
    ...row,
    scope_level: row.scope_level || "strategic_alignment",
    project_id: row.project_id ?? null,
    program: row.program ?? null,
    portfolio: row.portfolio ?? null,
  };
}

export function channelScopeKey(c: GovernanceChannel) {
  const level = c.scope_level || "strategic_alignment";
  if (level === "project") return c.project_id || "";
  if (level === "program") return (c.program || "").trim();
  return (c.portfolio || "").trim();
}

/**
 * A forum belongs to a project only through the same buckets used elsewhere:
 * project row → program name → Strategic Alignment (`projects.portfolio`).
 * Org-wide forums (SA with no portfolio) are not mixed into every project.
 */
export function inheritedForProject(c: GovernanceChannel, project: GovernanceProject | undefined) {
  if (!project) return false;
  const level = c.scope_level || "strategic_alignment";
  if (level === "project") return c.project_id === project.id;
  if (level === "program") {
    return Boolean(project.program) && c.program === project.program;
  }
  return Boolean(project.portfolio) && c.portfolio === project.portfolio;
}

export function channelsForProjects(channels: GovernanceChannel[], projects: GovernanceProject[]) {
  if (!projects.length) return [];
  return channels.filter((c) => projects.some((p) => inheritedForProject(c, p)));
}

/** Projects the signed-in person is actually on: PM, allocated resource, or stakeholder. */
export function resolveMyProjectIds(opts: {
  userId?: string | null;
  projects: Array<{ id: string; pm_user_id?: string | null }>;
  myResourceIds: string[];
  allocationProjectIds: string[];
  stakeholderProjectIds: string[];
}) {
  const ids = new Set<string>();
  const uid = opts.userId || "";
  for (const p of opts.projects) {
    if (uid && p.pm_user_id === uid) ids.add(p.id);
  }
  for (const id of opts.allocationProjectIds) if (id) ids.add(id);
  for (const id of opts.stakeholderProjectIds) if (id) ids.add(id);
  return [...ids];
}

export type ForumMemberView = {
  channel_id: string;
  resource_id: string;
  role: string;
  name: string;
};

export type ForumNode = {
  channel: GovernanceChannel;
  members: ForumMemberView[];
};

export type ProjectGovernanceBucket = {
  project: GovernanceProject;
  forums: ForumNode[];
};

export type ProgramGovernanceBucket = {
  program: string;
  forums: ForumNode[];
  projects: ProjectGovernanceBucket[];
};

export type AlignmentGovernanceBucket = {
  portfolio: string;
  forums: ForumNode[];
  programs: ProgramGovernanceBucket[];
};

function nodesFor(channels: GovernanceChannel[], membersByChannel: Map<string, ForumMemberView[]>) {
  return [...channels]
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map((channel) => ({
      channel,
      members: membersByChannel.get(channel.id) || [],
    }));
}

/** Strategic Alignment → Program → Project tree for the given project set. */
export function buildGovernanceHierarchy(
  projects: GovernanceProject[],
  channels: GovernanceChannel[],
  members: ForumMemberView[],
): AlignmentGovernanceBucket[] {
  const membersByChannel = new Map<string, ForumMemberView[]>();
  for (const m of members) {
    const list = membersByChannel.get(m.channel_id) || [];
    list.push(m);
    membersByChannel.set(m.channel_id, list);
  }

  const saKeys = [...new Set(projects.map((p) => (p.portfolio || "").trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );

  return saKeys.map((portfolio) => {
    const saProjects = projects.filter((p) => (p.portfolio || "").trim() === portfolio);
    const saForums = channels.filter(
      (c) =>
        (c.scope_level || "strategic_alignment") === "strategic_alignment" &&
        (c.portfolio || "").trim() === portfolio,
    );
    const programKeys = [
      ...new Set(saProjects.map((p) => (p.program || "").trim()).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b));

    const programs: ProgramGovernanceBucket[] = programKeys.map((program) => {
      const progProjects = saProjects.filter((p) => (p.program || "").trim() === program);
      const programForums = channels.filter(
        (c) => (c.scope_level || "") === "program" && (c.program || "").trim() === program,
      );
      const projectBuckets: ProjectGovernanceBucket[] = [...progProjects]
        .sort((a, b) => projectOptionsLabel(a).localeCompare(projectOptionsLabel(b)))
        .map((project) => ({
          project,
          forums: nodesFor(
            channels.filter(
              (c) => (c.scope_level || "") === "project" && c.project_id === project.id,
            ),
            membersByChannel,
          ),
        }));
      return {
        program,
        forums: nodesFor(programForums, membersByChannel),
        projects: projectBuckets,
      };
    });

    const unassigned = saProjects.filter((p) => !(p.program || "").trim());
    if (unassigned.length) {
      programs.push({
        program: "Unassigned program",
        forums: [],
        projects: unassigned
          .sort((a, b) => projectOptionsLabel(a).localeCompare(projectOptionsLabel(b)))
          .map((project) => ({
            project,
            forums: nodesFor(
              channels.filter(
                (c) => (c.scope_level || "") === "project" && c.project_id === project.id,
              ),
              membersByChannel,
            ),
          })),
      });
    }

    return {
      portfolio,
      forums: nodesFor(saForums, membersByChannel),
      programs,
    };
  });
}

export function forumPeopleLine(node: ForumNode) {
  const named = node.members.map((m) => (m.role === "chair" ? `${m.name} (chair)` : m.name));
  if (named.length) return named.join(", ");
  if (node.channel.chair) return `${node.channel.chair} (chair)`;
  return "No members listed";
}

export function orgWideForums(
  channels: GovernanceChannel[],
  members: ForumMemberView[],
): ForumNode[] {
  const membersByChannel = new Map<string, ForumMemberView[]>();
  for (const m of members) {
    const list = membersByChannel.get(m.channel_id) || [];
    list.push(m);
    membersByChannel.set(m.channel_id, list);
  }
  return nodesFor(
    channels.filter(
      (c) =>
        (c.scope_level || "strategic_alignment") === "strategic_alignment" &&
        !(c.portfolio || "").trim(),
    ),
    membersByChannel,
  );
}

export function filterGovernanceChannels(
  channels: GovernanceChannel[],
  filters: {
    projectId?: string;
    program?: string;
    portfolio?: string;
    streamName?: string;
    cadence?: string;
    scope?: string;
  },
  projects: GovernanceProject[],
  streams: GovernanceStream[],
) {
  const projectById = new Map(projects.map((p) => [p.id, p]));
  let streamProjectIds: Set<string> | null = null;
  if (filters.streamName) {
    streamProjectIds = new Set(
      streams.filter((s) => s.name === filters.streamName).map((s) => s.project_id),
    );
  }

  return channels.filter((c) => {
    if (filters.cadence && (c.cadence || "") !== filters.cadence) return false;
    if (filters.scope && (c.scope_level || "strategic_alignment") !== filters.scope) return false;

    if (filters.projectId) {
      const p = projectById.get(filters.projectId);
      if (!inheritedForProject(c, p)) return false;
    }

    if (filters.program) {
      const pids = projects.filter((p) => p.program === filters.program).map((p) => p.id);
      const level = c.scope_level || "strategic_alignment";
      const ok =
        (level === "program" && c.program === filters.program) ||
        (level === "project" && c.project_id && pids.includes(c.project_id)) ||
        (level === "strategic_alignment" &&
          projects.some((p) => p.program === filters.program && c.portfolio === p.portfolio));
      if (!ok) return false;
    }

    if (filters.portfolio) {
      const pids = projects.filter((p) => p.portfolio === filters.portfolio).map((p) => p.id);
      const level = c.scope_level || "strategic_alignment";
      const ok =
        (level === "strategic_alignment" && c.portfolio === filters.portfolio) ||
        (level === "project" && c.project_id && pids.includes(c.project_id)) ||
        (level === "program" &&
          projects.some((p) => p.portfolio === filters.portfolio && p.program === c.program));
      if (!ok) return false;
    }

    if (streamProjectIds) {
      const level = c.scope_level || "strategic_alignment";
      if (level === "project") {
        if (!c.project_id || !streamProjectIds.has(c.project_id)) return false;
      } else {
        const related = projects.filter((p) => streamProjectIds!.has(p.id));
        if (!related.length) return false;
        if (level === "program") {
          if (!related.some((p) => p.program === c.program)) return false;
        } else if (c.portfolio && !related.some((p) => p.portfolio === c.portfolio)) {
          return false;
        }
      }
    }

    return true;
  });
}

export function canManageGovernanceChannel(
  channel: GovernanceChannel,
  opts: { isAdmin: boolean; userId?: string | null; projects: GovernanceProject[] },
) {
  if (opts.isAdmin) return true;
  if ((channel.scope_level || "strategic_alignment") !== "project" || !channel.project_id) {
    return false;
  }
  const p = opts.projects.find((x) => x.id === channel.project_id);
  return Boolean(opts.userId && p?.pm_user_id === opts.userId);
}

export function projectOptionsLabel(p: GovernanceProject) {
  return p.project_code ? `${p.project_code} · ${p.name}` : p.name;
}
